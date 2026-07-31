/**
 * Topical taxonomy for the Glaze store catalog.
 *
 * Glaze provides 7 flat categories and no sub-structure, so the second level
 * is derived here: ordered keyword rules matched (first match wins) against
 * the lowercased "name tagline description" of each app. Rules are
 * deterministic, so every sync classifies new apps the same way. Anything
 * unmatched falls to "General", where frequent-term mining
 * (scripts/shared/organize.mjs) promotes emergent topics automatically.
 *
 * Rules were written against the actual store contents; more specific rules
 * go first.
 */

const T = (name, pattern) => [name, pattern];

const TAXONOMIES = {
  Productivity: [
    T("AI & Assistants", /\b(ai|llm|gpt|chatgpt|claude|gemini|copilot|assistant|summar|transcri|prompt)\b/),
    T("Tasks & Projects", /\b(task|todo|to-do|kanban|project|planner|planning|backlog|sprint|checklist|goal)\b/),
    T("Notes & Writing", /\b(note|notes|writ|markdown|journal|document|typewriter|draft|scratch|text editor)\b/),
    T("Calendar & Time", /\b(calendar|schedul|meeting|countdown|timer|timezone|time zone|clock|agenda|reminder|deadline)\b/),
    T("Reading & Feeds", /\b(read|reader|rss|feed|article|pdf|book|blog|newsletter|later|bookmark)\b/),
    T("Email & Messaging", /\b(email|inbox|mail|unsubscribe|message|imessage|slack|chat)\b/),
    T("Focus & Wellbeing", /\b(focus|breath|posture|pomodoro|break|calm|distraction|mindful|habit)\b/),
    T("Tracking & Analytics", /\b(track|monitor|stats|statistic|usage|keystroke|analytics|spend|budget|money|expense|subscription|invoice)\b/),
    T("Files & Organization", /\b(file|folder|organi|archive|clipboard|storage|sync|drive|tag)\b/),
    T("Search & Launch", /\b(search|launch|shortcut|command|quick access|switcher)\b/),
  ],

  Utilities: [
    T("Files & Disk", /\b(file|folder|disk|storage|clean|declutter|duplicate|compress|zip|archive|batch|rename)\b/),
    T("Image Tools", /\b(image|photo|picture|crop|resize|background|magnif|zoom|screenshot|thumbnail|convert.*imag|imag.*convert)\b/),
    T("Video & Audio Tools", /\b(video|audio|compress|download|convert|transcode|record|mic|microphone|sound|volume)\b/),
    T("System & Performance", /\b(system|performance|optimi|memory|ram|cpu|battery|defaults|preference|setting|health|speed|cache)\b/),
    T("Menu Bar & Dock", /\b(menu ?bar|dock|island|widget|status bar|tray)\b/),
    T("Display & Wallpaper", /\b(wallpaper|display|screen|monitor|theme|dark mode|brightness|resolution)\b/),
    T("Text & Clipboard", /\b(text|clipboard|paste|markdown|string|character|emoji|fancy|case)\b/),
    T("Network & Connectivity", /\b(network|wifi|wi-fi|vpn|bluetooth|port|dns|ip\b|speed test|connection)\b/),
    T("Input & Gestures", /\b(gesture|keyboard|mouse|trackpad|hotkey|shortcut|click|key)\b/),
    T("Trackers & Monitors", /\b(track|monitor|flight|aircraft|plane|weather|sky|watch)\b/),
    T("Security & Privacy", /\b(password|secur|privacy|encrypt|vault|lock|hash|2fa)\b/),
  ],

  "Developer Tools": [
    T("AI & LLM Tools", /\b(ai|llm|gpt|chatgpt|claude|gemini|copilot|agent|skill|model|prompt|token|mcp)\b/),
    T("Git & Repositories", /\b(git|repo|github|gitlab|commit|branch|pull request|version control|diff)\b/),
    T("Terminal & Shell", /\b(terminal|shell|command|cli\b|script|bash|zsh|ssh)\b/),
    T("Packages & Environments", /\b(brew|homebrew|package|npm|yarn|pnpm|dependenc|docker|container|env|node)\b/),
    T("APIs & Networking", /\b(api|http|request|endpoint|json|webhook|graphql|rest|port|localhost|curl)\b/),
    T("Databases & Data", /\b(database|sql|postgres|mysql|sqlite|redis|query|schema)\b/),
    T("Design & UI Development", /\b(color|contrast|symbol|shader|component|icon|css|font|figma|design system|ui\b)\b/),
    T("Debugging & Inspection", /\b(debug|inspect|log|monitor|profil|trace|defaults|error)\b/),
    T("Raycast & Glaze", /\b(raycast|glaze|extension|playground)\b/),
    T("Docs & Reference", /\b(doc|documentation|reference|cheat|snippet|hacker news|browse|learn)\b/),
    T("Testing & Quality", /\b(test|lint|format|validat|benchmark|coverage)\b/),
  ],

  Media: [
    T("Music & Instruments", /\b(music|song|radio|synth|piano|beat|drum|chord|guitar|bass|tune|playlist|spotify|album|audio)\b/),
    T("Video & Streaming", /\b(video|youtube|stream|movie|film|tv\b|player|watch|clip|record)\b/),
    T("Photos & Camera", /\b(photo|camera|webcam|mirror|picture|monochrome|filter|snapshot)\b/),
    T("Sports", /\b(football|soccer|f1\b|formula|world cup|race|match|league|nba|nfl|cricket|tennis|sport)\b/),
    T("News & Reading", /\b(news|rss|feed|newspaper|book|read|article|magazine)\b/),
    T("Art & Wallpapers", /\b(art|wallpaper|gallery|museum|visuali|animation|creative)\b/),
    T("Sound Effects & Boards", /\b(soundboard|sound effect|ambient|noise|whoosh|soundscape)\b/),
  ],

  Design: [
    T("Color & Palettes", /\b(color|colour|palette|gradient|contrast|shade|hue|swatch)\b/),
    T("Fonts & Typography", /\b(font|typograph|typeface|type|glyph|ascii|lettering)\b/),
    T("Icons & Logos", /\b(icon|logo|brand|emoji|symbol|favicon)\b/),
    T("Screenshots & Mockups", /\b(screenshot|mockup|frame|capture|beautif|og image|open graph)\b/),
    T("3D, Shaders & Geometry", /\b(3d|voxel|shader|curve|bezier|radius|corner|render|geometry)\b/),
    T("Images & Backgrounds", /\b(image|photo|background|transparent|remove|dither|wallpaper)\b/),
    T("Boards & Inspiration", /\b(moodboard|board|collection|inspiration|reference|organi|stash|pin)\b/),
    T("Layout & Planning", /\b(layout|plan|room|space|grid|foam|case)\b/),
  ],

  "Games & Fun": [
    T("Arcade & Classics", /\b(tetris|pac-?man|snake|breakout|brick|invader|pinball|arcade|pusher|runner|flappy|retro|classic)\b/),
    T("Puzzle & Word Games", /\b(puzzle|word|wordle|guess|crossword|sudoku|cube|rubik|azul|match|solitaire|mine ?sweeper|minesweeper)\b/),
    T("Typing & Reflex", /\b(typ|reflex|reaction|speed|click|tap|aim)\b/),
    T("Desktop Pets & Toys", /\b(pet|cat|dog|buddy|companion|toy|silly|punch|fidget|bounce)\b/),
    T("Card, Board & Casino", /\b(card|poker|chess|board game|dice|spin|slot|lucky|casino|bet)\b/),
    T("Collections & Discovery", /\b(pokedex|pok[eé]mon|collect|discover|catalog|explore|trivia|quiz)\b/),
  ],

  Lifestyle: [
    T("Health & Fitness", /\b(fitness|exercise|workout|gym|move|posture|step|health|sleep|weight)\b/),
    T("Hydration & Nutrition", /\b(hydrat|water|drink|caffeine|coffee|nutrition|calorie|diet)\b/),
    T("Food & Drink", /\b(recipe|cook|cocktail|sip|meal|food|bar\b|brew|kitchen)\b/),
    T("Mindfulness & Wellbeing", /\b(breath|calm|medit|mindful|wellness|relax|mood|journal)\b/),
    T("Travel & Places", /\b(travel|trip|map|globe|world|roam|place|city|country|journey|golden hour)\b/),
    T("Nature & Outdoors", /\b(bird|nature|weather|garden|plant|outdoor|season|moon|sun)\b/),
    T("Astrology & Divination", /\b(astro|tarot|horoscope|zodiac|star sign|divination)\b/),
    T("Style & Personal", /\b(outfit|style|fashion|scent|perfume|wardrobe|grooming)\b/),
    T("Social & Connection", /\b(connect|friend|bond|social|relationship|family|contact)\b/),
    T("Learning & Hobbies", /\b(learn|lesson|practice|course|tutorial|hobby|skill|study)\b/),
  ],
};

// Fallback for any category Glaze adds that has no rules yet.
const GLOBAL_TAXONOMY = [
  T("AI Tools", /\b(ai|llm|gpt|claude|agent|prompt|model)\b/),
  T("Developer Utilities", /\b(git|api|code|json|terminal|debug|deploy|script)\b/),
  T("Productivity & Tasks", /\b(task|todo|note|calendar|reminder|focus|track)\b/),
  T("Media & Entertainment", /\b(music|video|photo|game|movie|audio|stream)\b/),
  T("Design & Visuals", /\b(color|font|icon|design|image|wallpaper|shader)\b/),
  T("Health & Lifestyle", /\b(health|fitness|food|travel|habit|wellness)\b/),
  T("System & Files", /\b(file|folder|system|disk|window|display|network)\b/),
];

const FALLBACK = "General";

/** Ordered subcategory names for a category (General always last). */
export function subcategoriesOf(category) {
  const rules = TAXONOMIES[category] ?? GLOBAL_TAXONOMY;
  return [...rules.map(([name]) => name), FALLBACK];
}

/** First matching subcategory for an app within its category. */
export function classify(app, category) {
  const hay = `${app.name} ${app.tagline} ${app.description}`.toLowerCase();
  const rules = TAXONOMIES[category] ?? GLOBAL_TAXONOMY;
  for (const [name, pattern] of rules) if (pattern.test(hay)) return name;
  return FALLBACK;
}

/**
 * Editorial grouping of Glaze's top-level categories into sections, used
 * wherever a list of categories is rendered. Unknown categories fall into a
 * trailing "More" section.
 */
export const CATEGORY_SECTIONS = [
  ["Work & Productivity", ["Productivity"]],
  ["Development", ["Developer Tools"]],
  ["System & Utilities", ["Utilities"]],
  ["Creative & Media", ["Design", "Media"]],
  ["Life & Play", ["Lifestyle", "Games & Fun"]],
];

/**
 * Editorial grouping of each category's subcategories, used on category pages
 * instead of one flat topic list.
 */
const SUBCATEGORY_SECTIONS = {
  Productivity: [
    ["Plan & Organize", ["Tasks & Projects", "Calendar & Time", "Files & Organization"]],
    ["Capture & Read", ["Notes & Writing", "Reading & Feeds", "Email & Messaging"]],
    ["Work Smarter", ["AI & Assistants", "Search & Launch", "Tracking & Analytics"]],
    ["Wellbeing", ["Focus & Wellbeing"]],
  ],
  Utilities: [
    ["Files & Media", ["Files & Disk", "Image Tools", "Video & Audio Tools"]],
    ["System & Desktop", ["System & Performance", "Menu Bar & Dock", "Display & Wallpaper"]],
    ["Input & Text", ["Input & Gestures", "Text & Clipboard"]],
    ["Network & Safety", ["Network & Connectivity", "Security & Privacy", "Trackers & Monitors"]],
  ],
  "Developer Tools": [
    ["Code & Collaboration", ["Git & Repositories", "Docs & Reference", "Testing & Quality"]],
    ["Build & Run", ["Terminal & Shell", "Packages & Environments", "APIs & Networking", "Databases & Data"]],
    ["Platforms", ["AI & LLM Tools", "Raycast & Glaze"]],
    ["Craft", ["Design & UI Development", "Debugging & Inspection"]],
  ],
  Media: [
    ["Listen & Watch", ["Music & Instruments", "Video & Streaming", "Sound Effects & Boards"]],
    ["Look & Read", ["Photos & Camera", "Art & Wallpapers", "News & Reading"]],
    ["Follow", ["Sports"]],
  ],
  Design: [
    ["Visual Elements", ["Color & Palettes", "Fonts & Typography", "Icons & Logos"]],
    ["Create & Capture", ["Screenshots & Mockups", "Images & Backgrounds", "3D, Shaders & Geometry"]],
    ["Organize & Plan", ["Boards & Inspiration", "Layout & Planning"]],
  ],
  "Games & Fun": [
    ["Play", ["Arcade & Classics", "Puzzle & Word Games", "Card, Board & Casino"]],
    ["Skill & Toys", ["Typing & Reflex", "Desktop Pets & Toys"]],
    ["Explore", ["Collections & Discovery"]],
  ],
  Lifestyle: [
    ["Body", ["Health & Fitness", "Hydration & Nutrition", "Food & Drink"]],
    ["Mind", ["Mindfulness & Wellbeing", "Astrology & Divination", "Learning & Hobbies"]],
    ["World & Self", ["Travel & Places", "Nature & Outdoors", "Style & Personal", "Social & Connection"]],
  ],
  "*": [
    ["Digital Tools", ["AI Tools", "Developer Utilities", "Productivity & Tasks", "System & Files"]],
    ["Media & Design", ["Media & Entertainment", "Design & Visuals"]],
    ["Life", ["Health & Lifestyle"]],
  ],
};

/** Section layout for a category's subcategories ("*" fallback). */
export function sectionsForCategory(category) {
  return SUBCATEGORY_SECTIONS[category] ?? SUBCATEGORY_SECTIONS["*"];
}
