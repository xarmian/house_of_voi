-- Balance History Over Time Function
-- Returns plotable ticks showing balance changes for an Algorand address between two rounds

CREATE OR REPLACE FUNCTION get_balance_history(
    algorand_address TEXT,
    start_round BIGINT,
    end_round BIGINT
)
RETURNS TABLE(
    block_round BIGINT,
    timestamp TIMESTAMP WITHOUT TIME ZONE,
    intra INTEGER,
    balance_delta BIGINT,
    fee BIGINT,
    actual_balance BIGINT,
    tick_number BIGINT
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH target_addr AS (
        SELECT decode_algorand_address(algorand_address) as addr
    ),
    current_balance AS (
        SELECT microalgos as balance
        FROM account, target_addr ta
        WHERE account.addr = ta.addr
    ),
    balance_changes AS (
        SELECT 
            tp.round,
            bh.realtime,
            tp.intra,
            CASE 
                WHEN t.txn->'txn'->>'type' = 'pay' THEN
                    CASE 
                        WHEN decode(t.txn->'txn'->>'snd', 'base64') = ta.addr THEN -(t.txn->'txn'->>'amt')::bigint
                        WHEN decode(t.txn->'txn'->>'rcv', 'base64') = ta.addr THEN (t.txn->'txn'->>'amt')::bigint
                        ELSE 0
                    END
                ELSE 0 
            END as balance_delta,
            COALESCE((t.txn->'txn'->>'fee')::bigint, 0) as fee
        FROM target_addr ta
        JOIN txn_participation tp ON tp.addr = ta.addr
        JOIN txn t ON tp.round = t.round AND tp.intra = t.intra
        JOIN block_header bh ON t.round = bh.round
        WHERE tp.round BETWEEN start_round AND end_round
    )
    SELECT 
        bc.round,
        bc.realtime,
        bc.intra,
        bc.balance_delta,
        bc.fee,
        -- For the last (most recent) row, show current balance
        -- For other rows, calculate backwards from current balance
        CASE 
            WHEN ROW_NUMBER() OVER (ORDER BY bc.round DESC, bc.intra DESC) = 1 THEN 
                (SELECT balance FROM current_balance)
            ELSE
                (SELECT balance FROM current_balance) - SUM(bc.balance_delta - bc.fee) OVER (
                    ORDER BY bc.round DESC, bc.intra DESC 
                    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW EXCLUDE CURRENT ROW
                )
        END,
        ROW_NUMBER() OVER (ORDER BY bc.round, bc.intra)
    FROM balance_changes bc
    ORDER BY bc.round, bc.intra;
END;
$$;

-- Usage example:
-- SELECT * FROM get_balance_history('H7W63MIQJMYBOEYPM5NJEGX3P54H54RZIV2G3OQ2255AULG6U74BE5KFC4', 10600000, 10650000);

-- HOV Events Table for tracking bets
CREATE TABLE IF NOT EXISTS hov_events (
    round BIGINT NOT NULL,
    intra INTEGER NOT NULL,
    txid TEXT NOT NULL,
    app_id BIGINT NOT NULL,
    event_type TEXT NOT NULL, -- 'BetPlaced' or 'BetClaimed'
    
    -- Common fields for both events
    who TEXT NOT NULL, -- Algorand address
    amount BIGINT NOT NULL, -- bet amount in microalgos
    max_payline_index BIGINT NOT NULL,
    index_value BIGINT NOT NULL, -- renamed from 'index' to avoid SQL keyword
    claim_round BIGINT NOT NULL,
    
    -- BetClaimed specific field
    payout BIGINT NULL DEFAULT 0, -- null for BetPlaced, set when BetClaimed
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NULL,
    
    -- Primary key should be the actual transaction identifier
    CONSTRAINT hov_events_pkey PRIMARY KEY (round, intra),
    -- index_value is NOT unique and should not be used for matching
    -- Keep a unique constraint on app_id + round + intra for safety
    CONSTRAINT hov_events_app_txn_key UNIQUE (app_id, round, intra)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_hov_events_app_id ON hov_events(app_id, round DESC);
CREATE INDEX IF NOT EXISTS idx_hov_events_who ON hov_events(who, round DESC);
CREATE INDEX IF NOT EXISTS idx_hov_events_claim_round ON hov_events(claim_round);
CREATE INDEX IF NOT EXISTS idx_hov_events_event_type ON hov_events(event_type, round DESC);
CREATE INDEX IF NOT EXISTS idx_hov_events_unclaimed ON hov_events(app_id, claim_round) WHERE payout IS NULL;

-- ABI definitions for HOV arc4 events
CREATE OR REPLACE FUNCTION get_hov_abi()
RETURNS JSONB AS $$
BEGIN
    RETURN '[
        {
            "name": "BetPlaced",
            "type": "event",
            "inputs": [
                {"name": "who", "type": "address"},
                {"name": "amount", "type": "uint64"},
                {"name": "max_payline_index", "type": "uint64"},
                {"name": "index", "type": "uint64"},
                {"name": "claim_round", "type": "uint64"}
            ]
        },
        {
            "name": "BetClaimed", 
            "type": "event",
            "inputs": [
                {"name": "who", "type": "address"},
                {"name": "amount", "type": "uint64"},
                {"name": "max_payline_index", "type": "uint64"},
                {"name": "index", "type": "uint64"},
                {"name": "claim_round", "type": "uint64"},
                {"name": "payout", "type": "uint64"}
            ]
        }
    ]'::JSONB;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate arc4 event signature using SHA-512/256
CREATE OR REPLACE FUNCTION get_hov_event_signature(event_name TEXT)
RETURNS TEXT AS $$
DECLARE
    event_string TEXT;
    hash BYTEA;
BEGIN
    CASE event_name
        WHEN 'BetPlaced' THEN
            event_string := 'BetPlaced(address,uint64,uint64,uint64,uint64)';
        WHEN 'BetClaimed' THEN
            event_string := 'BetClaimed(address,uint64,uint64,uint64,uint64,uint64)';
        ELSE
            RETURN NULL;
    END CASE;
    
    -- Calculate SHA-512/256 hash and return first 4 bytes as hex
    hash := extensions.digest(event_string, 'sha512-256');
    RETURN encode(substring(hash from 1 for 4), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Function to decode a single arc4 parameter  
CREATE OR REPLACE FUNCTION decode_arc4_parameter(
    param_type TEXT,
    data_bytes BYTEA,
    byte_position INTEGER
)
RETURNS TABLE(
    decoded_value JSONB,
    new_position INTEGER
) AS $$
BEGIN
    CASE param_type
        WHEN 'address' THEN
            -- Algorand address is 32 bytes
            RETURN QUERY SELECT 
                to_jsonb(hex_to_algorand_address(encode(substring(data_bytes, byte_position, 32), 'hex')))::JSONB,
                byte_position + 32;
                
        WHEN 'uint64' THEN
            -- uint64 is 8 bytes, big-endian
            RETURN QUERY SELECT 
                to_jsonb(('x' || encode(substring(data_bytes, byte_position, 8), 'hex'))::bit(64)::bigint)::JSONB,
                byte_position + 8;
                
        ELSE
            -- Unknown type, return hex
            RETURN QUERY SELECT 
                to_jsonb(encode(substring(data_bytes, byte_position, 32), 'hex'))::JSONB,
                byte_position + 32;
    END CASE;
END;
$$ LANGUAGE plpgsql;

-- Function to decode HOV arc4 events
CREATE OR REPLACE FUNCTION decode_hov_event(log_base64 TEXT)
RETURNS JSONB AS $$
DECLARE
    decoded_bytes BYTEA;
    event_signature BYTEA;
    event_data BYTEA;
    signature_hex TEXT;
    event_name TEXT;
    result JSONB;
    current_pos INTEGER := 1;
    param_value JSONB;
    new_pos INTEGER;
BEGIN
    -- Clean and decode base64
    BEGIN
        decoded_bytes := decode(regexp_replace(log_base64, '^["\\]+|["\\]+$', '', 'g'), 'base64');
    EXCEPTION WHEN OTHERS THEN
        RETURN jsonb_build_object('error', 'Invalid base64 log');
    END;
    
    -- Must have at least 4 bytes for signature
    IF length(decoded_bytes) < 4 THEN
        RETURN jsonb_build_object('error', 'Log too short');
    END IF;
    
    -- Extract signature (first 4 bytes) and data
    event_signature := substring(decoded_bytes, 1, 4);
    event_data := substring(decoded_bytes, 5);
    signature_hex := encode(event_signature, 'hex');
    
    -- Determine event type by signature
    IF signature_hex = get_hov_event_signature('BetPlaced') THEN
        event_name := 'BetPlaced';
    ELSIF signature_hex = get_hov_event_signature('BetClaimed') THEN
        event_name := 'BetClaimed';
    ELSE
        RETURN jsonb_build_object(
            'error', 'Unknown event signature',
            'signature', signature_hex
        );
    END IF;
    
    -- Initialize result
    result := jsonb_build_object('event', event_name);
    
    -- Decode parameters based on event type
    current_pos := 1;
    
    -- Common parameters for both events: who, amount, max_payline_index, index, claim_round
    
    -- who (address - 32 bytes)
    SELECT decoded_value, new_position INTO param_value, new_pos 
    FROM decode_arc4_parameter('address', event_data, current_pos);
    result := result || jsonb_build_object('who', param_value);
    current_pos := new_pos;
    
    -- amount (uint64 - 8 bytes)
    SELECT decoded_value, new_position INTO param_value, new_pos 
    FROM decode_arc4_parameter('uint64', event_data, current_pos);
    result := result || jsonb_build_object('amount', param_value);
    current_pos := new_pos;
    
    -- max_payline_index (uint64 - 8 bytes) 
    SELECT decoded_value, new_position INTO param_value, new_pos
    FROM decode_arc4_parameter('uint64', event_data, current_pos);
    result := result || jsonb_build_object('max_payline_index', param_value);
    current_pos := new_pos;
    
    -- index (uint64 - 8 bytes)
    SELECT decoded_value, new_position INTO param_value, new_pos
    FROM decode_arc4_parameter('uint64', event_data, current_pos);
    result := result || jsonb_build_object('index', param_value);
    current_pos := new_pos;
    
    -- claim_round (uint64 - 8 bytes)
    SELECT decoded_value, new_position INTO param_value, new_pos
    FROM decode_arc4_parameter('uint64', event_data, current_pos);
    result := result || jsonb_build_object('claim_round', param_value);
    current_pos := new_pos;
    
    -- If BetClaimed, decode payout parameter
    IF event_name = 'BetClaimed' THEN
        SELECT decoded_value, new_position INTO param_value, new_pos
        FROM decode_arc4_parameter('uint64', event_data, current_pos);
        result := result || jsonb_build_object('payout', param_value);
    END IF;
    
    RETURN result;
    
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('error', SQLERRM);
END;
$$ LANGUAGE plpgsql;

-- Function to process HOV events and update hov_events table
CREATE OR REPLACE FUNCTION process_hov_event(
    p_app_id BIGINT,
    p_round BIGINT,
    p_intra INTEGER,
    p_txid TEXT,
    decoded_event JSONB
)
RETURNS JSONB AS $$
DECLARE
    event_type TEXT;
    who_address TEXT;
    amount_val BIGINT;
    max_payline_index_val BIGINT;
    index_val BIGINT;
    claim_round_val BIGINT;
    payout_val BIGINT;
    existing_record RECORD;
    result JSONB;
BEGIN
    -- Extract common fields
    event_type := decoded_event->>'event';
    who_address := decoded_event->>'who';
    amount_val := (decoded_event->>'amount')::BIGINT;
    max_payline_index_val := (decoded_event->>'max_payline_index')::BIGINT;
    index_val := (decoded_event->>'index')::BIGINT;
    claim_round_val := (decoded_event->>'claim_round')::BIGINT;
    
    IF event_type = 'BetPlaced' THEN
        -- Insert new bet record
        INSERT INTO hov_events (
            round, intra, txid, app_id, event_type,
            who, amount, max_payline_index, index_value, claim_round,
            payout
        ) VALUES (
            p_round, p_intra, p_txid, p_app_id, event_type,
            who_address, amount_val, max_payline_index_val, index_val, claim_round_val,
            NULL  -- payout starts as null for BetPlaced
        )
        ON CONFLICT (round, intra) 
        DO UPDATE SET
            -- Only update if the existing record doesn't have payout data (hasn't been claimed)
            -- or if this is an earlier transaction (lower round/intra)
            round = CASE 
                WHEN hov_events.payout IS NULL OR EXCLUDED.round < hov_events.round THEN EXCLUDED.round 
                ELSE hov_events.round 
            END,
            intra = CASE 
                WHEN hov_events.payout IS NULL OR EXCLUDED.round < hov_events.round THEN EXCLUDED.intra 
                ELSE hov_events.intra 
            END,
            txid = CASE 
                WHEN hov_events.payout IS NULL OR EXCLUDED.round < hov_events.round THEN EXCLUDED.txid 
                ELSE hov_events.txid 
            END,
            event_type = CASE 
                WHEN hov_events.payout IS NULL THEN EXCLUDED.event_type 
                ELSE hov_events.event_type 
            END,
            who = CASE 
                WHEN hov_events.payout IS NULL OR EXCLUDED.round < hov_events.round THEN EXCLUDED.who 
                ELSE hov_events.who 
            END,
            amount = CASE 
                WHEN hov_events.payout IS NULL OR EXCLUDED.round < hov_events.round THEN EXCLUDED.amount 
                ELSE hov_events.amount 
            END,
            max_payline_index = CASE 
                WHEN hov_events.payout IS NULL OR EXCLUDED.round < hov_events.round THEN EXCLUDED.max_payline_index 
                ELSE hov_events.max_payline_index 
            END,
            claim_round = CASE 
                WHEN hov_events.payout IS NULL OR EXCLUDED.round < hov_events.round THEN EXCLUDED.claim_round 
                ELSE hov_events.claim_round 
            END,
            updated_at = NOW();
            
        result := jsonb_build_object(
            'action', 'inserted_bet_placed',
            'app_id', p_app_id,
            'index', index_val
        );
        
    ELSIF event_type = 'BetClaimed' THEN
        payout_val := (decoded_event->>'payout')::BIGINT;
        
        -- Find the matching BetPlaced record using all claim criteria
        SELECT * INTO existing_record 
        FROM hov_events 
        WHERE app_id = p_app_id 
        AND who = who_address
        AND amount = amount_val
        AND max_payline_index = max_payline_index_val
        AND index_value = index_val
        AND claim_round = claim_round_val
        AND hov_events.event_type = 'BetPlaced'
        AND payout IS NULL; -- Only unclaimed bets
        
        IF FOUND THEN
            -- Update the existing BetPlaced record with payout
            UPDATE hov_events 
            SET 
                payout = payout_val,
                event_type = 'BetClaimed', -- Update event type to show it's been claimed
                updated_at = NOW()
            WHERE app_id = p_app_id 
            AND who = who_address
            AND amount = amount_val
            AND max_payline_index = max_payline_index_val
            AND index_value = index_val
            AND claim_round = claim_round_val
            AND hov_events.event_type = 'BetPlaced'  -- Qualify the column reference
            AND payout IS NULL;
            
            result := jsonb_build_object(
                'action', 'updated_bet_claimed',
                'app_id', p_app_id,
                'index', index_val,
                'payout', payout_val,
                'original_round', existing_record.round,
                'original_intra', existing_record.intra
            );
        ELSE
            -- Insert new record (claim without matching bet - orphaned claim)
            INSERT INTO hov_events (
                round, intra, txid, app_id, event_type,
                who, amount, max_payline_index, index_value, claim_round,
                payout
            ) VALUES (
                p_round, p_intra, p_txid, p_app_id, event_type,
                who_address, amount_val, max_payline_index_val, index_val, claim_round_val,
                payout_val
            );
            
            result := jsonb_build_object(
                'action', 'inserted_orphaned_claim',
                'app_id', p_app_id,
                'index', index_val,
                'payout', payout_val
            );
        END IF;
    ELSE
        result := jsonb_build_object(
            'action', 'unknown_event_type',
            'event_type', event_type
        );
    END IF;
    
    RETURN result;
    
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'action', 'error',
        'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql;

-- Function to scan and process HOV events from transaction logs
CREATE OR REPLACE FUNCTION scan_hov_events(
    p_app_id BIGINT,
    p_start_round BIGINT DEFAULT NULL,
    p_end_round BIGINT DEFAULT NULL,
    p_limit INTEGER DEFAULT 1000
)
RETURNS TABLE(
    processed_count BIGINT,
    errors_count BIGINT,
    summary JSONB
) AS $$
DECLARE
    processed_cnt BIGINT := 0;
    errors_cnt BIGINT := 0;
    log_record RECORD;
    decoded_event JSONB;
    process_result JSONB;
    summary_result JSONB;
BEGIN
    -- Scan application logs for HOV events
    FOR log_record IN
        SELECT 
            t.round,
            t.intra,
            encode(t.txid, 'hex') as txid,
            elem::text as log_base64
        FROM txn t,
        jsonb_array_elements(t.txn->'dt'->'lg') as elem
        WHERE t.txn->'txn'->>'apid' = p_app_id::text
        AND t.txn->'txn'->>'type' = 'appl'
        AND t.txn->'dt'->'lg' IS NOT NULL
        AND (p_start_round IS NULL OR t.round >= p_start_round)
        AND (p_end_round IS NULL OR t.round <= p_end_round)
        ORDER BY t.round ASC, t.intra ASC  -- Process oldest first so bets are placed before claims
        LIMIT p_limit
    LOOP
        BEGIN
            -- Decode the event
            decoded_event := decode_hov_event(log_record.log_base64);
            
            -- Skip if not a HOV event or has error
            IF decoded_event ? 'error' OR NOT (decoded_event->>'event' IN ('BetPlaced', 'BetClaimed')) THEN
                CONTINUE;
            END IF;
            
            -- Process the event
            process_result := process_hov_event(
                p_app_id,
                log_record.round,
                log_record.intra,
                log_record.txid,
                decoded_event
            );
            
            processed_cnt := processed_cnt + 1;
            
        EXCEPTION WHEN OTHERS THEN
            errors_cnt := errors_cnt + 1;
        END;
    END LOOP;
    
    -- Build summary
    summary_result := jsonb_build_object(
        'app_id', p_app_id,
        'start_round', p_start_round,
        'end_round', p_end_round,
        'processed_events', processed_cnt,
        'errors', errors_cnt
    );
    
    RETURN QUERY SELECT processed_cnt, errors_cnt, summary_result;
END;
$$ LANGUAGE plpgsql;

-- HOV Analytics: Computed Columns and Performance Optimizations

-- Add computed columns for efficient calculations
ALTER TABLE hov_events 
ADD COLUMN IF NOT EXISTS total_bet_amount BIGINT GENERATED ALWAYS AS (amount * (max_payline_index + 1)) STORED;

ALTER TABLE hov_events 
ADD COLUMN IF NOT EXISTS net_result BIGINT GENERATED ALWAYS AS (COALESCE(payout, 0) - (amount * (max_payline_index + 1))) STORED;

ALTER TABLE hov_events 
ADD COLUMN IF NOT EXISTS is_win BOOLEAN GENERATED ALWAYS AS (payout > 0) STORED;

-- Additional performance indexes
CREATE INDEX IF NOT EXISTS idx_hov_events_who_payout ON hov_events(who, payout) WHERE payout IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hov_events_app_round_payout ON hov_events(app_id, round DESC) WHERE payout > 0;
CREATE INDEX IF NOT EXISTS idx_hov_events_total_bet ON hov_events(app_id, total_bet_amount DESC);
CREATE INDEX IF NOT EXISTS idx_hov_events_net_result ON hov_events(app_id, net_result DESC);
CREATE INDEX IF NOT EXISTS idx_hov_events_wins ON hov_events(app_id, round DESC) WHERE is_win = true;

-- Platform Statistics Function
CREATE OR REPLACE FUNCTION get_hov_platform_stats(
    p_app_id BIGINT,
    p_start_round BIGINT DEFAULT NULL,
    p_end_round BIGINT DEFAULT NULL
)
RETURNS TABLE(
    total_bets BIGINT,
    total_amount_bet BIGINT,
    total_amount_paid BIGINT,
    total_winning_spins BIGINT,
    average_bet_size NUMERIC(20,2),
    average_payout NUMERIC(20,2),
    win_percentage NUMERIC(5,2),
    house_edge NUMERIC(5,2),
    rtp NUMERIC(5,2),
    net_platform_result BIGINT,
    unique_players BIGINT,
    largest_single_win BIGINT,
    largest_single_bet BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH stats AS (
        SELECT 
            COUNT(*) as bet_count,
            SUM(total_bet_amount) as total_bet,
            SUM(COALESCE(payout, 0)) as total_payout,
            COUNT(*) FILTER (WHERE is_win) as winning_count,
            AVG(total_bet_amount::NUMERIC) as avg_bet,
            AVG(payout::NUMERIC) FILTER (WHERE is_win) as avg_payout_when_win,
            COUNT(DISTINCT who) as player_count,
            MAX(COALESCE(payout, 0)) as max_win,
            MAX(total_bet_amount) as max_bet,
            SUM(total_bet_amount) - SUM(COALESCE(payout, 0)) as platform_profit
        FROM hov_events
        WHERE app_id = p_app_id
        AND (p_start_round IS NULL OR round >= p_start_round)
        AND (p_end_round IS NULL OR round <= p_end_round)
    )
    SELECT 
        s.bet_count,
        s.total_bet::BIGINT,
        s.total_payout::BIGINT,
        s.winning_count,
        ROUND(s.avg_bet, 2),
        ROUND(COALESCE(s.avg_payout_when_win, 0), 2),
        ROUND(CASE WHEN s.bet_count > 0 THEN (s.winning_count::NUMERIC / s.bet_count::NUMERIC) * 100 ELSE 0 END, 2),
        ROUND(CASE WHEN s.total_bet > 0 THEN ((s.total_bet - s.total_payout)::NUMERIC / s.total_bet::NUMERIC) * 100 ELSE 0 END, 2),
        ROUND(CASE WHEN s.total_bet > 0 THEN (s.total_payout::NUMERIC / s.total_bet::NUMERIC) * 100 ELSE 0 END, 2),
        s.platform_profit::BIGINT,
        s.player_count,
        s.max_win::BIGINT,
        s.max_bet::BIGINT
    FROM stats s;
END;
$$ LANGUAGE plpgsql;

-- Materialized View for Leaderboard Performance
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_hov_leaderboard AS
SELECT 
    app_id,
    who,
    COUNT(*) as total_spins,
    SUM(total_bet_amount) as total_amount_bet,
    SUM(COALESCE(payout, 0)) as total_amount_won,
    SUM(net_result) as net_result,
    COUNT(*) FILTER (WHERE is_win) as winning_spins,
    MAX(COALESCE(payout, 0)) as largest_single_win,
    ROUND(AVG(total_bet_amount::NUMERIC), 2) as avg_bet_size,
    ROUND(
        CASE WHEN COUNT(*) > 0 THEN 
            (COUNT(*) FILTER (WHERE is_win)::NUMERIC / COUNT(*)::NUMERIC) * 100 
        ELSE 0 END, 2
    ) as win_rate,
    MIN(round) as first_bet_round,
    MAX(round) as last_bet_round,
    -- Calculate longest winning streak (simplified approach)
    COALESCE(
        (SELECT MAX(streak_count)
         FROM (
             WITH ordered_bets AS (
                 SELECT is_win, 
                        ROW_NUMBER() OVER (ORDER BY round, intra) as rn
                 FROM hov_events he2 
                 WHERE he2.app_id = he.app_id AND he2.who = he.who
             ),
             streak_groups AS (
                 SELECT is_win,
                        rn - ROW_NUMBER() OVER (PARTITION BY is_win ORDER BY rn) as streak_group
                 FROM ordered_bets
             )
             SELECT COUNT(*) as streak_count
             FROM streak_groups
             WHERE is_win = true
             GROUP BY streak_group
         ) streaks), 
         0
    ) as longest_streak
FROM hov_events he
GROUP BY app_id, who;

-- Indexes on materialized view for fast leaderboard queries
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_hov_leaderboard_pk ON mv_hov_leaderboard(app_id, who);
CREATE INDEX IF NOT EXISTS idx_mv_hov_leaderboard_net_result ON mv_hov_leaderboard(app_id, net_result DESC);
CREATE INDEX IF NOT EXISTS idx_mv_hov_leaderboard_total_won ON mv_hov_leaderboard(app_id, total_amount_won DESC);
CREATE INDEX IF NOT EXISTS idx_mv_hov_leaderboard_largest_win ON mv_hov_leaderboard(app_id, largest_single_win DESC);
CREATE INDEX IF NOT EXISTS idx_mv_hov_leaderboard_total_spins ON mv_hov_leaderboard(app_id, total_spins DESC);
CREATE INDEX IF NOT EXISTS idx_mv_hov_leaderboard_win_rate ON mv_hov_leaderboard(app_id, win_rate DESC);
CREATE INDEX IF NOT EXISTS idx_mv_hov_leaderboard_total_bet ON mv_hov_leaderboard(app_id, total_amount_bet DESC);
CREATE INDEX IF NOT EXISTS idx_mv_hov_leaderboard_rtp ON mv_hov_leaderboard(app_id, ((total_amount_won::NUMERIC / NULLIF(total_amount_bet, 0)::NUMERIC) * 100) DESC);

-- Function to refresh leaderboard data
CREATE OR REPLACE FUNCTION refresh_hov_leaderboard()
RETURNS VOID AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_hov_leaderboard;
END;
$$ LANGUAGE plpgsql;

-- Leaderboard query function
CREATE OR REPLACE FUNCTION get_hov_leaderboard(
    p_app_id BIGINT,
    p_metric TEXT DEFAULT 'net_result', -- 'net_result', 'rtp', 'total_won', 'largest_win', 'total_spins', 'win_rate', 'total_bet'
    p_limit INTEGER DEFAULT 100,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
    rank_position BIGINT,
    who TEXT,
    total_spins BIGINT,
    total_amount_bet NUMERIC,
    total_amount_won NUMERIC,
    net_result NUMERIC,
    largest_single_win BIGINT,
    win_rate NUMERIC(5,2),
    longest_streak INTEGER,
    avg_bet_size NUMERIC(20,2)
) AS $$
BEGIN
    RETURN QUERY
    WITH ranked_players AS (
        SELECT 
            l.who,
            l.total_spins,
            l.total_amount_bet,
            l.total_amount_won,
            l.net_result,
            l.largest_single_win,
            l.win_rate,
            l.longest_streak,
            l.avg_bet_size,
            -- Calculate RTP once for reuse
            CASE WHEN l.total_amount_bet > 0 THEN 
                (l.total_amount_won / l.total_amount_bet) * 100 
            ELSE 0 END as rtp_value,
            -- Assign rank based on metric
            ROW_NUMBER() OVER (
                ORDER BY 
                    CASE p_metric
                        WHEN 'net_result' THEN l.net_result
                        WHEN 'total_won' THEN l.total_amount_won
                        WHEN 'largest_win' THEN l.largest_single_win::NUMERIC
                        WHEN 'total_bet' THEN l.total_amount_bet
                        WHEN 'total_spins' THEN l.total_spins::NUMERIC
                        WHEN 'win_rate' THEN l.win_rate
                        WHEN 'rtp' THEN CASE WHEN l.total_amount_bet > 0 THEN 
                            (l.total_amount_won / l.total_amount_bet) * 100 
                        ELSE 0 END
                        ELSE l.net_result -- default
                    END DESC
            ) as rank
        FROM mv_hov_leaderboard l
        WHERE l.app_id = p_app_id
    )
    SELECT 
        rp.rank,
        rp.who,
        rp.total_spins,
        rp.total_amount_bet,
        rp.total_amount_won,
        rp.net_result,
        rp.largest_single_win,
        rp.win_rate,
        rp.longest_streak::INTEGER,
        rp.avg_bet_size
    FROM ranked_players rp
    ORDER BY rp.rank
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- Player Statistics Functions

-- Detailed player statistics
CREATE OR REPLACE FUNCTION get_player_stats(
    p_app_id BIGINT,
    p_player_address TEXT
)
RETURNS TABLE(
    total_spins BIGINT,
    total_amount_bet BIGINT,
    total_amount_won BIGINT,
    net_result BIGINT,
    largest_single_win BIGINT,
    average_bet_size NUMERIC(20,2),
    win_rate NUMERIC(5,2),
    longest_winning_streak INTEGER,
    longest_losing_streak INTEGER,
    favorite_bet_amount BIGINT,
    total_paylines_played BIGINT,
    first_bet_round BIGINT,
    last_bet_round BIGINT,
    days_active INTEGER,
    longest_streak INTEGER,
    profit_per_spin NUMERIC(20,2)
) AS $$
DECLARE
    streak_data RECORD;
    longest_streak_val INTEGER := 0;
BEGIN
    -- Calculate winning and losing streaks
    WITH ordered_bets AS (
        SELECT is_win, 
               round,
               intra,
               LAG(is_win) OVER (ORDER BY round, intra) as prev_is_win
        FROM hov_events 
        WHERE app_id = p_app_id AND who = p_player_address
    ),
    streak_groups AS (
        SELECT is_win,
               SUM(CASE WHEN is_win != COALESCE(prev_is_win, NOT is_win) THEN 1 ELSE 0 END) 
               OVER (ORDER BY round, intra) as streak_group
        FROM ordered_bets
    ),
    streak_lengths AS (
        SELECT is_win, streak_group, COUNT(*) as streak_count
        FROM streak_groups
        GROUP BY is_win, streak_group
    ),
    max_streaks AS (
        SELECT 
            MAX(streak_count) FILTER (WHERE is_win = true) as max_win_streak,
            MAX(streak_count) FILTER (WHERE is_win = false) as max_loss_streak
        FROM streak_lengths
    )
    SELECT 
        COALESCE(max_win_streak, 0) as max_win_streak,
        COALESCE(max_loss_streak, 0) as max_loss_streak
    INTO streak_data
    FROM max_streaks;
    
    -- Calculate longest consecutive-day (UTC) activity streak
    WITH active_days AS (
        SELECT DISTINCT (date_trunc('day', bh.realtime AT TIME ZONE 'UTC'))::date AS day
        FROM hov_events he
        JOIN block_header bh ON he.round = bh.round
        WHERE he.app_id = p_app_id AND he.who = p_player_address
    ),
    grouped AS (
        SELECT day, (day - (ROW_NUMBER() OVER (ORDER BY day))::int) AS grp
        FROM active_days
    )
    SELECT COALESCE(MAX(cnt), 0) INTO longest_streak_val
    FROM (
        SELECT COUNT(*) AS cnt
        FROM grouped
        GROUP BY grp
    ) s;
    
    RETURN QUERY
    SELECT 
        COUNT(*)::BIGINT as total_spins,
        SUM(amount * (max_payline_index + 1))::BIGINT as total_amount_bet,
        SUM(COALESCE(payout, 0))::BIGINT as total_amount_won,
        SUM(COALESCE(payout, 0) - (amount * (max_payline_index + 1)))::BIGINT as net_result,
        MAX(COALESCE(payout, 0))::BIGINT as largest_single_win,
        ROUND(AVG((amount * (max_payline_index + 1))::NUMERIC), 2) as average_bet_size,
        ROUND(
            CASE WHEN COUNT(*) > 0 THEN 
                (COUNT(*) FILTER (WHERE payout > 0)::NUMERIC / COUNT(*)::NUMERIC) * 100 
            ELSE 0 END, 2
        ) as win_rate,
        streak_data.max_win_streak::INTEGER as longest_winning_streak,
        streak_data.max_loss_streak::INTEGER as longest_losing_streak,
        -- Most common bet amount
        (SELECT (amount * (max_payline_index + 1)) FROM hov_events 
         WHERE app_id = p_app_id AND who = p_player_address 
         GROUP BY (amount * (max_payline_index + 1)) 
         ORDER BY COUNT(*) DESC 
         LIMIT 1)::BIGINT as favorite_bet_amount,
        SUM(max_payline_index + 1)::BIGINT as total_paylines_played,
        MIN(round)::BIGINT as first_bet_round,
        MAX(round)::BIGINT as last_bet_round,
        -- Approximate days active (based on rounds, not actual days)
        GREATEST(1, (MAX(round) - MIN(round)) / 86400)::INTEGER as days_active,
        longest_streak_val::INTEGER as longest_streak,
        ROUND(
            CASE WHEN COUNT(*) > 0 THEN 
                SUM(COALESCE(payout, 0) - (amount * (max_payline_index + 1)))::NUMERIC / COUNT(*)::NUMERIC 
            ELSE 0 END, 2
        ) as profit_per_spin
    FROM hov_events
    WHERE app_id = p_app_id AND who = p_player_address;
END;
$$ LANGUAGE plpgsql;

-- Player spin history with pagination
CREATE OR REPLACE FUNCTION get_player_spins(
    p_app_id BIGINT,
    p_player_address TEXT,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
    round BIGINT,
    intra INTEGER,
    txid TEXT,
    bet_amount_per_line BIGINT,
    paylines_count INTEGER,
    total_bet_amount BIGINT,
    payout BIGINT,
    net_result BIGINT,
    is_win BOOLEAN,
    claim_round BIGINT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        he.round,
        he.intra,
        he.txid,
        he.amount as bet_amount_per_line,
        (he.max_payline_index + 1)::INTEGER as paylines_count,
        he.total_bet_amount,
        COALESCE(he.payout, 0) as payout,
        he.net_result,
        he.is_win,
        he.claim_round,
        he.created_at
    FROM hov_events he
    WHERE he.app_id = p_app_id 
    AND he.who = p_player_address
    ORDER BY he.round DESC, he.intra DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- Get player ranking for a specific metric
CREATE OR REPLACE FUNCTION get_player_rank(
    p_app_id BIGINT,
    p_player_address TEXT,
    p_metric TEXT DEFAULT 'net_result'
)
RETURNS TABLE(
    player_rank BIGINT,
    total_players BIGINT,
    percentile NUMERIC(5,2)
) AS $$
BEGIN
    RETURN QUERY
    WITH ranked_players AS (
        SELECT 
            who,
            ROW_NUMBER() OVER (
                ORDER BY 
                    CASE 
                        WHEN p_metric = 'net_result' THEN net_result
                        WHEN p_metric = 'total_won' THEN total_amount_won
                        WHEN p_metric = 'largest_win' THEN largest_single_win
                        WHEN p_metric = 'total_spins' THEN total_spins
                        WHEN p_metric = 'total_bet' THEN total_amount_bet
                        ELSE net_result
                    END DESC,
                    CASE WHEN p_metric = 'win_rate' THEN win_rate ELSE 0 END DESC,
                    CASE WHEN p_metric = 'rtp' THEN 
                        CASE WHEN total_amount_bet > 0 THEN 
                            (total_amount_won::NUMERIC / total_amount_bet::NUMERIC) * 100 
                        ELSE 0 END
                    ELSE 0 END DESC
            ) as rank,
            COUNT(*) OVER () as total_count
        FROM mv_hov_leaderboard
        WHERE app_id = p_app_id
    )
    SELECT 
        rp.rank,
        rp.total_count,
        ROUND((rp.total_count - rp.rank + 1)::NUMERIC / rp.total_count::NUMERIC * 100, 2) as percentile
    FROM ranked_players rp
    WHERE rp.who = p_player_address;
END;
$$ LANGUAGE plpgsql;

-- Time-based Analytics Functions

-- Daily/Hourly platform statistics
CREATE OR REPLACE FUNCTION get_hov_time_stats(
    p_app_id BIGINT,
    p_time_unit TEXT DEFAULT 'day', -- 'hour', 'day', 'week'
    p_start_round BIGINT DEFAULT NULL,
    p_end_round BIGINT DEFAULT NULL,
    p_limit INTEGER DEFAULT 30
)
RETURNS TABLE(
    time_period TIMESTAMP,
    total_bets BIGINT,
    total_amount_bet BIGINT,
    total_amount_won BIGINT,
    unique_players BIGINT,
    win_rate NUMERIC(5,2),
    house_edge NUMERIC(5,2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        CASE 
            WHEN p_time_unit = 'hour' THEN date_trunc('hour', bh.realtime)
            WHEN p_time_unit = 'week' THEN date_trunc('week', bh.realtime)
            ELSE date_trunc('day', bh.realtime)
        END as time_period,
        COUNT(he.*) as total_bets,
        SUM(he.total_bet_amount) as total_amount_bet,
        SUM(COALESCE(he.payout, 0)) as total_amount_won,
        COUNT(DISTINCT he.who) as unique_players,
        ROUND(
            CASE WHEN COUNT(he.*) > 0 THEN 
                (COUNT(he.*) FILTER (WHERE he.is_win)::NUMERIC / COUNT(he.*)::NUMERIC) * 100 
            ELSE 0 END, 2
        ) as win_rate,
        ROUND(
            CASE WHEN SUM(he.total_bet_amount) > 0 THEN 
                ((SUM(he.total_bet_amount) - SUM(COALESCE(he.payout, 0)))::NUMERIC / SUM(he.total_bet_amount)::NUMERIC) * 100 
            ELSE 0 END, 2
        ) as house_edge
    FROM hov_events he
    JOIN block_header bh ON he.round = bh.round
    WHERE he.app_id = p_app_id
    AND (p_start_round IS NULL OR he.round >= p_start_round)
    AND (p_end_round IS NULL OR he.round <= p_end_round)
    GROUP BY time_period
    ORDER BY time_period DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Hot and cold players (recent performance)
CREATE OR REPLACE FUNCTION get_hot_cold_players(
    p_app_id BIGINT,
    p_recent_rounds BIGINT DEFAULT 100000, -- Look at recent rounds
    p_min_spins INTEGER DEFAULT 10,
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE(
    who TEXT,
    recent_spins BIGINT,
    recent_net_result BIGINT,
    recent_win_rate NUMERIC(5,2),
    temperature TEXT, -- 'HOT', 'COLD', 'NEUTRAL'
    total_spins BIGINT,
    overall_net_result BIGINT
) AS $$
DECLARE
    max_round BIGINT;
BEGIN
    -- Get the maximum round for this app
    SELECT MAX(round) INTO max_round FROM hov_events WHERE app_id = p_app_id;
    
    RETURN QUERY
    WITH recent_performance AS (
        SELECT 
            he.who,
            COUNT(*) as recent_spins,
            SUM(he.net_result) as recent_net,
            ROUND(
                CASE WHEN COUNT(*) > 0 THEN 
                    (COUNT(*) FILTER (WHERE he.is_win)::NUMERIC / COUNT(*)::NUMERIC) * 100 
                ELSE 0 END, 2
            ) as recent_win_pct
        FROM hov_events he
        WHERE he.app_id = p_app_id
        AND he.round >= (max_round - p_recent_rounds)
        GROUP BY he.who
        HAVING COUNT(*) >= p_min_spins
    ),
    overall_stats AS (
        SELECT 
            who,
            COUNT(*) as total_spins,
            SUM(net_result) as total_net
        FROM hov_events
        WHERE app_id = p_app_id
        GROUP BY who
    )
    SELECT 
        rp.who,
        rp.recent_spins,
        rp.recent_net,
        rp.recent_win_pct,
        CASE 
            WHEN rp.recent_net > 0 AND rp.recent_win_pct > 60 THEN 'HOT'
            WHEN rp.recent_net < 0 AND rp.recent_win_pct < 30 THEN 'COLD'
            ELSE 'NEUTRAL'
        END as temperature,
        os.total_spins,
        os.total_net
    FROM recent_performance rp
    JOIN overall_stats os ON rp.who = os.who
    ORDER BY rp.recent_net DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Whale detection (high-value players)
CREATE OR REPLACE FUNCTION get_whales(
    p_app_id BIGINT,
    p_min_total_bet BIGINT DEFAULT 1000000000, -- 1000 algo minimum
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE(
    who TEXT,
    total_amount_bet BIGINT,
    total_amount_won BIGINT,
    net_result BIGINT,
    total_spins BIGINT,
    average_bet_size BIGINT,
    largest_single_bet BIGINT,
    largest_single_win BIGINT,
    risk_level TEXT -- 'HIGH', 'MEDIUM', 'LOW'
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        l.who,
        l.total_amount_bet,
        l.total_amount_won,
        l.net_result,
        l.total_spins,
        (l.total_amount_bet / l.total_spins) as average_bet_size,
        (SELECT MAX(total_bet_amount) FROM hov_events WHERE app_id = p_app_id AND who = l.who) as largest_single_bet,
        l.largest_single_win,
        CASE 
            WHEN l.total_amount_bet > 10000000000 THEN 'HIGH'  -- 10,000 algo
            WHEN l.total_amount_bet > 5000000000 THEN 'MEDIUM' -- 5,000 algo
            ELSE 'LOW'
        END as risk_level
    FROM mv_hov_leaderboard l
    WHERE l.app_id = p_app_id
    AND l.total_amount_bet >= p_min_total_bet
    ORDER BY l.total_amount_bet DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Payline analysis
CREATE OR REPLACE FUNCTION get_payline_analysis(
    p_app_id BIGINT
)
RETURNS TABLE(
    paylines_count INTEGER,
    total_bets BIGINT,
    total_amount_bet NUMERIC,
    total_amount_won NUMERIC,
    avg_bet_per_line NUMERIC(20,2),
    win_rate NUMERIC(5,2),
    house_edge NUMERIC(5,2),
    rtp NUMERIC(5,2) -- Return to Player
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (max_payline_index + 1)::INTEGER as paylines_count,
        COUNT(*) as total_bets,
        SUM(total_bet_amount) as total_amount_bet,
        SUM(COALESCE(payout, 0)) as total_amount_won,
        ROUND(AVG(amount::NUMERIC), 2) as avg_bet_per_line,
        ROUND(
            CASE WHEN COUNT(*) > 0 THEN 
                (COUNT(*) FILTER (WHERE is_win)::NUMERIC / COUNT(*)::NUMERIC) * 100 
            ELSE 0 END, 2
        ) as win_rate,
        ROUND(
            CASE WHEN SUM(total_bet_amount) > 0 THEN 
                ((SUM(total_bet_amount) - SUM(COALESCE(payout, 0)))::NUMERIC / SUM(total_bet_amount)::NUMERIC) * 100 
            ELSE 0 END, 2
        ) as house_edge,
        ROUND(
            CASE WHEN SUM(total_bet_amount) > 0 THEN 
                (SUM(COALESCE(payout, 0))::NUMERIC / SUM(total_bet_amount)::NUMERIC) * 100 
            ELSE 0 END, 2
        ) as rtp
    FROM hov_events
    WHERE app_id = p_app_id
    GROUP BY max_payline_index + 1
    ORDER BY paylines_count;
END;
$$ LANGUAGE plpgsql;

-- Usage examples and maintenance function
CREATE OR REPLACE FUNCTION get_hov_usage_examples()
RETURNS TEXT AS $$
BEGIN
    RETURN '
    HOV Analytics Functions Usage Examples:
    
    -- Platform Statistics
    SELECT * FROM get_hov_platform_stats(YOUR_APP_ID);
    SELECT * FROM get_hov_platform_stats(YOUR_APP_ID, 10000000, 11000000);
    
    -- Leaderboards
    SELECT * FROM get_hov_leaderboard(YOUR_APP_ID, ''net_result'', 10);
    SELECT * FROM get_hov_leaderboard(YOUR_APP_ID, ''largest_win'', 50);
    CALL refresh_hov_leaderboard(); -- Refresh materialized view
    
    -- Player Statistics
    SELECT * FROM get_player_stats(YOUR_APP_ID, ''PLAYER_ADDRESS'');
    SELECT * FROM get_player_spins(YOUR_APP_ID, ''PLAYER_ADDRESS'', 20, 0);
    SELECT * FROM get_player_rank(YOUR_APP_ID, ''PLAYER_ADDRESS'', ''net_result'');
    
    -- Time-based Analytics
    SELECT * FROM get_hov_time_stats(YOUR_APP_ID, ''day'', NULL, NULL, 30);
    SELECT * FROM get_hot_cold_players(YOUR_APP_ID, 50000, 5, 10);
    
    -- High-value Player Analysis
    SELECT * FROM get_whales(YOUR_APP_ID, 1000000000, 20);
    
    -- Game Mechanics Analysis
    SELECT * FROM get_payline_analysis(YOUR_APP_ID);
    ';
END;
$$ LANGUAGE plpgsql;

-- Trigger function to automatically process HOV events
CREATE OR REPLACE FUNCTION process_new_hov_transaction()
RETURNS TRIGGER AS $$
DECLARE
    log_elem JSONB;
    decoded_event JSONB;
    process_result JSONB;
    app_id_val BIGINT;
BEGIN
    -- Only process application transactions with logs
    IF (NEW.txn->'txn'->>'type') != 'appl' 
       OR (NEW.txn->'dt'->'lg') IS NULL THEN
        RETURN NEW;
    END IF;
    
    -- Extract app_id
    app_id_val := (NEW.txn->'txn'->>'apid')::BIGINT;
    IF app_id_val IS NULL THEN
        RETURN NEW;
    END IF;
    
    -- Process each log entry
    FOR log_elem IN SELECT jsonb_array_elements(NEW.txn->'dt'->'lg')
    LOOP
        BEGIN
            -- Decode the event
            decoded_event := decode_hov_event(log_elem::TEXT);
            
            -- Skip if not a HOV event or has error
            IF decoded_event ? 'error' OR NOT (decoded_event->>'event' IN ('BetPlaced', 'BetClaimed')) THEN
                CONTINUE;
            END IF;
            
            -- Process the event
            process_result := process_hov_event(
                app_id_val,
                NEW.round,
                NEW.intra,
                encode(NEW.txid, 'hex'),
                decoded_event
            );
            
        EXCEPTION WHEN OTHERS THEN
            -- Log errors but don't fail the entire transaction
            CONTINUE;
        END;
    END LOOP;
    
    RETURN NEW;
    
EXCEPTION WHEN OTHERS THEN
    -- Don't fail the entire transaction if HOV processing fails
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS process_hov_events ON txn;
CREATE TRIGGER process_hov_events
    AFTER INSERT ON txn 
    FOR EACH ROW 
    EXECUTE FUNCTION process_new_hov_transaction();

-- Refreshing materialized leaderboard
--  Option 1: Manual Refresh (Current Setup)

  -- After scanning events
  SELECT scan_hov_events(YOUR_APP_ID, NULL, NULL, 10000);
  SELECT refresh_hov_leaderboard();

--  Option 2: Automatic Refresh in Scan Function

--  We could modify scan_hov_events to automatically refresh if events were processed:
-- At end of scan_hov_events, add:
  IF processed_cnt > 0 THEN
      REFRESH MATERIALIZED VIEW CONCURRENTLY mv_hov_leaderboard;
  END IF;

--  Option 3: Scheduled Refresh (using pg_cron or external scheduler)

-- Every hour:
  SELECT cron.schedule('refresh-hov-leaderboard', '0 * * * *',
      'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_hov_leaderboard;');

