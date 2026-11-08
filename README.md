# Nook Isle Mobile — Reverse-Engineered Animal Crossing 3D Sandbox

A playable mobile-first 3D implementation of **Animal Crossing** built with **TypeScript**, **Three.js (Custom GLSL Rolling-Log Vertex Shader)**, **WebAudio Procedural Animalese**, **Vite**, and **Capacitor**.

## Reverse-Engineered Core Systems Implemented

1. **GLSL "Rolling Log" Horizon Vertex Shader (`src/engine/RollingWorldShader.ts`)**:
   - All world coordinates, physics, and tile interactions live on a flat Cartesian grid $(x, y, z)$.
   - Vertex positions bend downward quadratically as a function of Z-depth from the player camera:
     $$y_{\text{curved}} = y_{\text{world}} - k \cdot \max(0, |z - z_{\text{cam}}| - z_{\text{flat}})^2$$
   - Live curvature $k$ can be inspected and adjusted in real time inside **NookPhone → Engine & RTC Lab**.

2. **Acre & Multi-Elevation Spatial Grid (`src/engine/WorldGrid.ts`)**:
   - $48 \times 48$ tile island ($3 \times 3$ acres) with 3 elevation tiers: Perimeter Ocean & Sandy Beach (Elevation 0), Main Meadow, Town Plaza & River Bridge (Elevation 1), and Northern Cedar Clifftop with Waterfall & Incline Ramp (Elevation 2).

3. **Real-Time Clock & 05:00 AM Offline Delta Simulator (`src/engine/RealTimeClock.ts`, `src/simulation/DeltaSimulator.ts`)**:
   - Synchronizes with the device clock for 24-hour sky/sun lighting interpolation and hourly ambient music.
   - Simulates 05:00 AM daily rollovers to regrow harvested fruit trees, reset rock hit counters, bury new daily fossils & glowing bell spots, and step the Stalk Market turnip prices.

4. **Ephemeral Critter Ecology & Bobber Bite State Machine (`src/simulation/CritterSpawner.ts`)**:
   - Spawns active fish shadows (`XS` to `XL` + `Finned`) in the river and sea and flying/flower insects (`Common Butterfly`, `Emperor Butterfly`, `Queen Alexandra's Birdwing`, `Orchid Mantis`, `Firefly`) filtered by hour and weather.

5. **Villager Utility AI & Procedural Animalese Synthesizer (`src/simulation/VillagerAI.ts`, `src/engine/AudioSynthesizer.ts`)**:
   - Autonomous island neighbors (**Maple**, **Marshal**, **Roald**) wander, wave when approached, offer favors, accept gifts, and speak with real-time formant-filtered WebAudio Animalese.

6. **DIY Crafting, Island Decorator, Stalk Market & Custom Pixel Studio (`src/simulation/CraftingSystem.ts`, `src/simulation/EconomySystem.ts`, `src/ui/UIManager.ts`)**:
   - 16-slot Pocket Inventory, DIY Workbench crafting, outdoor furniture placement, 4-pattern Markov Stalk Market turnip tracker, Nook Miles+ mobile micro-goals, and a 16×16 Custom Pixel Path Editor.

## Running & Packaging for Mobile

```bash
# Start development server
npm run dev

# Build production bundle
npm run build

# Package for iOS / Android with Capacitor
npx cap add ios
npx cap add android
npx cap sync
```
