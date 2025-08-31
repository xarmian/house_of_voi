import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

// Handle OPTIONS request for CORS preflight
export const OPTIONS: RequestHandler = async () => {
  return new Response(null, {
    headers: corsHeaders
  });
};

// Shared function to prepare parameters for the RPC call
function prepareRpcParams(params: Record<string, any>): { p_app_id: number; p_player_address: string } {
  const rpcParams: { p_app_id?: number; p_player_address?: string } = {};

  // Convert appId to number if present
  if (params.appId !== undefined && params.appId !== null) {
    rpcParams.p_app_id = parseInt(String(params.appId), 10);
    if (isNaN(rpcParams.p_app_id)) {
        throw new Error('Invalid appId format. Must be a number.');
    }
  } else {
    throw new Error('appId is required');
  }

  // Pass address as string if present
  if (params.address !== undefined && params.address !== null) {
    rpcParams.p_player_address = String(params.address);
  } else {
    throw new Error('address is required');
  }

  return rpcParams as { p_app_id: number; p_player_address: string };
}

// Handle POST request for Hov player stats with JSON body
export const POST: RequestHandler = async ({ request }: { request: Request }) => {
  try {
    // Get parameters from request body
    const requestParams = await request.json();

    // Prepare parameters for RPC call
    const rpcParams = prepareRpcParams(requestParams);

    // Call the RPC function with direct parameters
    const { data, error } = await supabase.rpc('get_player_stats', rpcParams);
        
    if (error) {
      console.error('Supabase RPC error (POST /hov/players):', error);
      // Check for specific function-raised errors
      if (error.message.includes('Invalid')) {
         return json({ error: error.message }, { status: 400, headers: corsHeaders });
      }
      throw error; // Re-throw other Supabase errors
    }

    // Return the data directly as the function returns the desired JSON structure
    return json(data, { headers: corsHeaders });

  } catch (error: any) {
    console.error('Error fetching Hov player stats (POST):', error);
    // Handle specific validation errors from prepareRpcParams
     if (error.message.startsWith('Invalid') || error.message.includes('required')) {
        return json({ error: error.message }, { status: 400, headers: corsHeaders });
     }
    // Generic internal server error for other cases
    return json({ error: 'Internal server error' }, {
      status: 500,
      headers: corsHeaders
    });
  }
};

// Handle GET request for Hov player stats
export const GET: RequestHandler = async ({ url }: { url: URL }) => {
  try {
    // Get query parameters
    const queryParams = {
      appId: url.searchParams.get('appId'),
      address: url.searchParams.get('address'),
    };

    // Prepare parameters for RPC call
    const rpcParams = prepareRpcParams(queryParams);

    // Call the RPC function with direct parameters
    const { data, error } = await supabase.rpc('get_player_stats', rpcParams);

    if (error) {
      console.error('Supabase RPC error (GET /hov/players):', error);
       // Check for specific function-raised errors
      if (error.message.includes('Invalid')) {
         return json({ error: error.message }, { status: 400, headers: corsHeaders });
      }
      throw error; // Re-throw other Supabase errors
    }

    // Return the data directly
    return json(data, { headers: corsHeaders });

  } catch (error: any) {
    console.error('Error fetching Hov player stats (GET):', error);
     // Handle specific validation errors from prepareRpcParams
     if (error.message.startsWith('Invalid') || error.message.includes('required')) {
        return json({ error: error.message }, { status: 400, headers: corsHeaders });
     }
    // Generic internal server error
    return json({ error: 'Internal server error' }, {
      status: 500,
      headers: corsHeaders
    });
  }
}; 