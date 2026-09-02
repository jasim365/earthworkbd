# Earthwork Estimator Pro

You are an expert Full-Stack Software Engineer and Civil Engineering Software Specialist. Create a professional web application named "Earthwork Estimation Pro" for managing Canal/Embankment earthwork projects.

The application must be a responsive, data-heavy dashboard with the following features and technical requirements:

1. CORE MODULES:

   - Dashboard: Project overview, list of projects, and quick stats.

   - Design Configuration: A form to set Project Type (Re-sectioning), Chainage Unit (KM/M), Center Line calculation logic (Manual, Lowest Earth, Middle), and Design Levels.

   - Sectional Data (Pre & Post): Data grids for importing/entering Survey Data (Chainage, Distance, RL). Use editable data tables (shadcn/ui table).

   - Analysis Engine: Implement a calculation logic for Mean-Area (Volume = Mean Area * Distance).

   - Visualization: Use Recharts for plotting cross-sections (Pre-work, Design, Post-work lines).

   - Reports: A downloadable/printable table view for Abstract Estimate and Detailed Estimate.

2. TECHNICAL STACK & UI:

   - Framework: React with TypeScript, Tailwind CSS.

   - UI Components: Use shadcn/ui components (Cards, Tables, Select, Inputs, Tabs).

   - Graphs: Recharts for plotting X-Y coordinates of sections.

   - Layout: Clean, professional engineering dashboard style (Sidebar navigation + Main content area).

3. FUNCTIONAL REQUIREMENTS:

   - Calculation Logic: Implement the "Mean-Area" volume formula. Handle KM to Meter conversions.

   - Gap Handling: Logic to detect empty chainages and stop interpolation between disconnected segments.

   - Persistence: Allow adding multiple projects and saving state within the browser.

   - Progress Calculation: Calculate progress percentages comparing Pre-work vs Post-work data.

4. STEP-BY-STEP BUILD:

   - First, create the Project structure and Sidebar layout.

   - Then, create the Data Entry UI for Pre-work/Post-work sections.

   - Implement the Calculation utility functions.

   - Finally, add the Graph Plotting visualization using Recharts.

Please start by building the Project Dashboard and the Design Configuration form. Use a professional blue/grey color palette.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://earthworkbd.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/0d4c163d-d355-43ac-990f-65d1fec3b49c).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
