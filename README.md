# MapleStory Mini Game

A small MapleStory-inspired mini game project.

Built primarily with JavaScript, with supporting scripts/tools (Python) and some HTML assets.  
(Repo language breakdown on GitHub shows JavaScript, Python, and HTML.)

## Project structure

- `game/` - game implementation (client-side code and assets)
- `stats/` - data or scripts related to stats/analysis
- `tools/` - helper utilities

## Getting started (local)

Because this repo does not include a published release, the simplest way to run it locally is to serve the project with a lightweight local web server and open the game's entry file.

1. Clone the repo
   ```bash
   git clone https://github.com/danielbd94/MapleStory-Mini-Game.git
   cd MapleStory-Mini-Game
   ```

2. Start a local server (pick one)
   - Python:
     ```bash
     python -m http.server 8000
     ```
   - Node (if you have it):
     ```bash
     npx serve .
     ```

3. Open the game in your browser  
   Look for the main HTML entry file inside `game/` (commonly `index.html`) and open it via the server, for example:
   `http://localhost:8000/game/`

## Notes

- If you add a build system later (Vite/Webpack/etc.), consider documenting the exact `npm install` and `npm run` commands here.
- If you add screenshots or a short GIF, place them in an `assets/` folder and reference them in this README.

## Credits

Created by:
- Daniel Ben David (GitHub: `danielbd94`)
- Mor Avnaim (GitHub: `MorAvnaim`)

## License

No license file is currently included in the repository. If you intend others to reuse the code, add a LICENSE file (for example MIT) and update this section.
