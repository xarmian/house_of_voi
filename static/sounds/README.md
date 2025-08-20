# Sound Assets for House of Voi Slot Machine

This directory contains audio files for the slot machine game. **Current files are empty placeholders and must be replaced with actual audio assets.**

## 🔧 Current Status
- **All sound files are currently empty placeholders**
- The sound system is fully implemented and will work once proper audio files are added
- Error handling is in place to gracefully handle missing/invalid audio files

## 📁 Required Sound Files

### Slot Machine Sounds
- **spin-start.mp3** - Brief mechanical sound when spin begins (0.5-1 second)
- **spin-loop.mp3** - Looping reel spinning sound (should loop seamlessly)
- **reel-stop.mp3** - Individual reel stopping sound (0.2-0.5 seconds)

### Win/Loss Sounds
- **win-small.mp3** - Small win celebration (1-2 seconds)
- **win-medium.mp3** - Medium win celebration (2-3 seconds)  
- **win-large.mp3** - Large win celebration (3-4 seconds)
- **win-jackpot.mp3** - Jackpot celebration (4-6 seconds)
- **loss.mp3** - Subtle loss sound, non-abrasive (0.5-1 second)

### UI Sounds
- **button-click.mp3** - Button interaction sound (0.1-0.2 seconds)

### Ambient Sounds
- **background-ambience.mp3** - Optional casino atmosphere (should loop, 30+ seconds)

## 🎵 Audio Sources & Resources

### Free Audio Resources
1. **Freesound.org** - High-quality royalty-free sounds (requires attribution)
   - Search terms: "slot machine", "casino", "reel spin", "jackpot", "button click"
   
2. **Zapsplat.com** - Professional sound effects library (free with account)
   - Extensive casino and game sound collection
   
3. **Adobe Stock Audio** - Professional audio (subscription required)
   - High-quality casino and game sounds

4. **YouTube Audio Library** - Free music and sound effects
   - Filter by "Sound Effects" and search for casino/game sounds

### Recommended Search Terms
- "slot machine spinning"
- "casino reel stop"
- "jackpot celebration"
- "button click UI"
- "casino ambience"
- "mechanical reel"
- "win chime"

### Sound Creation Tools
- **Audacity** (Free) - For editing and creating simple sounds
- **Reaper** (Trial/License) - Professional audio editing
- **Online Tone Generators** - For simple beep/chime sounds

## 📝 Audio Specifications

### Technical Requirements
- **Format**: MP3 (primary), OGG/WEBM for better compression if needed
- **Quality**: 44.1kHz, 128-192 kbps for optimal web delivery
- **Volume**: Normalized to prevent clipping, consistent levels across all files
- **Looping**: spin-loop.mp3 and background-ambience.mp3 must loop seamlessly

### Length Guidelines
- **spin-start.mp3**: 0.5-1 second (brief mechanical start)
- **spin-loop.mp3**: 2-5 seconds (seamless loop)
- **reel-stop.mp3**: 0.2-0.5 seconds (quick stop sound)
- **button-click.mp3**: 0.1-0.2 seconds (short, satisfying)
- **win-small.mp3**: 1-2 seconds (pleasant but brief)
- **win-medium.mp3**: 2-3 seconds (more exciting)
- **win-large.mp3**: 3-4 seconds (dramatic)
- **win-jackpot.mp3**: 4-6 seconds (epic celebration)
- **loss.mp3**: 0.5-1 second (subtle, not punishing)
- **background-ambience.mp3**: 30+ seconds (seamless loop)

## 📦 File Size Considerations
- **Target total size**: Under 2MB for all sounds combined
- **Priority order**: 
  1. Essential sounds: spin-start, reel-stop, button-click
  2. Win sounds: win-small, win-medium, win-large, win-jackpot
  3. Feedback sounds: loss
  4. Optional: background-ambience (can be disabled)

## ⚖️ Licensing Requirements
- Ensure all sound files are properly licensed for commercial use
- Royalty-free or Creative Commons licensed sounds are recommended
- Keep records of licensing for each sound file
- Some free resources require attribution in your app/website

## 🧪 Testing Checklist
- [ ] All sounds load without errors
- [ ] Volume levels are consistent and pleasant
- [ ] Looping sounds (spin-loop, background-ambience) loop seamlessly
- [ ] Sounds work across different browsers (Chrome, Firefox, Safari, Edge)
- [ ] Mobile device compatibility
- [ ] No audio artifacts or clipping
- [ ] Win sounds match their respective celebration levels

## 🚀 Quick Start
1. Replace empty .mp3 files with actual audio files
2. Test in browser console - should see "Sound loaded successfully" messages
3. Use the sound settings panel in-game to adjust levels
4. Test each sound type using the "Test" buttons in settings

## 🎯 Pro Tips
- Start with just the essential sounds (spin-start, reel-stop, button-click) to get basic functionality
- Use consistent audio styling (similar reverb, EQ, etc.) for a cohesive experience
- The loss sound should be subtle and encouraging, not punishing
- Consider the target audience and brand when choosing sound style (elegant vs. fun vs. classic casino)
- Test with headphones and speakers at various volumes