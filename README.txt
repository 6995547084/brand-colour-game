Colour Clash - static version

Upload all files in this folder to a normal static web server.

Before uploading:
1. Open app.js.
2. Replace these values at the top:
   const SUPABASE_URL = "PASTE_YOUR_SUPABASE_URL_HERE";
   const SUPABASE_ANON_KEY = "PASTE_YOUR_SUPABASE_ANON_KEY_HERE";
3. Add your transparent PNG images to the rounds folder:
   rounds/round-1.png
   rounds/round-2.png
   ...
   rounds/round-10.png
4. Edit rounds.js to update questions, image paths and correct RGB values.

URLs:
- Home: index.html
- Admin: index.html?view=admin
- Player: index.html?view=player

Supabase tables required:
- games
- players
- guesses

Realtime must be enabled for all three tables.
