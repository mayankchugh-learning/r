/**
 * Topical subcategory taxonomy for the extensions catalog.
 *
 * Extensions carry only a flat top-level `categories` field, so second-level
 * grouping is derived here: ordered keyword rules matched (first match wins)
 * against the lowercased "title name description" of each extension. Rules are
 * deliberately deterministic so every sync run classifies new extensions the
 * same way. Anything unmatched lands in "General".
 *
 * Tuning: add/reorder rules per category; more specific rules go first.
 */

const T = (name, pattern) => [name, pattern];

const TAXONOMIES = {
  "Developer Tools": [
    T("AI & LLM Tools", /\b(ai|llm|gpt|openai|chatgpt|claude|anthropic|copilot|gemini|ollama|hugging ?face|prompt|langchain|mcp|codex|cursor|agent|model)\b/),
    T("Git & Version Control", /\b(git|github|gitlab|bitbucket|sourcetree|commits?|branch|pull request|merge request|repositor|gitea|svn|gist)\b/),
    T("Mobile & App Development", /\b(android|adb|ios|xcode|simulator|emulator|app store|testflight|flutter|react native|swiftui|swift|mobile app|app icon)\b/),
    T("Web3 & Blockchain", /\b(blockchain|web3|smart contract|ethereum|etherscan|solidity|starknet|solana|cosmos|algorand|bech32|wallet|token|\bens\b|crypto|atproto)\b/),
    T("Issue Tracking & Projects", /\b(jira|linear|asana|clickup|issue|ticket|sprint|scrum|kanban|backlog|basecamp|height|project management)\b/),
    T("CI/CD & DevOps", /\b(ci\/cd|\bci\b|jenkins|circleci|buildkite|travis|bitrise|codemagic|pipeline|devops|github actions|workflow run|builds?\b)\b/),
    T("Cloud, Hosting & Infrastructure", /\b(aws|amazon web|azure|gcp|google cloud|kubernetes|k8s|docker|container|terraform|pulumi|serverless|vercel|netlify|heroku|cloudflare|digitalocean|hetzner|fly\.io|railway|render|deploy|hosting|cpanel|coolify|appwrite|aiven|supabase|firebase|servers?\b|instance|infrastructure|self-?hosted|vps|domain|dns)\b/),
    T("Databases", /\b(database|postgres|postgresql|mysql|sqlite|mongodb|mongo|redis|planetscale|prisma|clickhouse|dynamodb|convex|airtable|\bsql\b)\b/),
    T("APIs & Networking", /\b(api|graphql|rest|http|curl|webhook|endpoint|postman|insomnia|oauth|auth0|localhost|ngrok|network|ip address|cidr|ipv[46]|certificate|ssl|tls|cookie|proxy|port)\b/),
    T("Monitoring & Logs", /\b(sentry|datadog|grafana|prometheus|logs?\b|monitor|uptime|status page|incident|pagerduty|observab|analytics|change ?detection)\b/),
    T("Terminal & Editors", /\b(terminal|shell|ssh|iterm|warp|tmux|zsh|bash|command line|\bcli\b|vs ?code|vscode|neovim|vim|jetbrains|intellij|editor|\bide\b|alacritty)\b/),
    T("Package & Dependency Tools", /\b(npm|yarn|pnpm|packages?\b|dependenc|homebrew|brew|pip|cargo|composer|maven|gradle|registry|cdnjs|library|libraries)\b/),
    T("Web & Frontend", /\b(css|html|frontend|front-end|react|vue|svelte|next\.?js|tailwind|components?\b|design system|browser|websites?\b|web development|accessibility|wcag|seo)\b/),
    T("Design & Assets", /\b(colors?\b|icons?\b|avatar|logo|svg|images?\b|screenshot|badge|favicon|brand)\b/),
    T("Automation & Scripting", /\b(cron|scripts?\b|automat|workflows?\b|scheduler|macro)\b/),
    T("Code, Snippets & Text Utilities", /\b(snippets?\b|regex|json|yaml|toml|xml|markdown|format|prettier|lint|escape|minif|diff|syntax|code|strings?\b|text|case|parse|convert|encode|decode|hash|checksum|uuid|base64)\b/),
    T("Search & Reference", /\b(search|docs|documentation|cheat ?sheets?|reference|can i use|lookup|directory)\b/),
    T("Files & Transfer", /\b(files?\b|folder|finder|clipboard|transfer|upload|download)\b/),
  ],

  Productivity: [
    T("AI & Assistants", /\b(ai|llm|gpt|openai|chatgpt|claude|gemini|ollama|copilot|assistant|transcri|speech to text|text to speech|whisper|dictat|summari|translat)\b/),
    T("Notes & Knowledge", /\b(notes?\b|notion|obsidian|roam|logseq|evernote|bear|craft|anytype|knowledge|zettelkasten|wiki|journal|second brain|highlights?\b)\b/),
    T("Tasks & To-Dos", /\b(todo|to-do|tasks?\b|reminders?\b|things ?3?|todoist|omnifocus|ticktick|checklist|habits?\b|goals?\b|gtd)\b/),
    T("Calendar & Scheduling", /\b(calendar|meetings?\b|schedul|events?\b|calendly|cal\.com|appointment|agenda|booking|zoom|google meet)\b/),
    T("Clipboard & Text Expansion", /\b(clipboard|paste|copy history|copied|text expan|espanso)\b/),
    T("Window & Workspace Management", /\b(windows?\b|workspace|layout|split screen|desktop|tiling|monitor arrangement|display arrangement|spaces?\b)\b/),
    T("Time Tracking & Focus", /\b(pomodoro|timers?\b|focus|time track|toggl|harvest|clockify|stopwatch|breaks?\b|deep work|logtime)\b/),
    T("Email", /\b(email|e-mail|gmail|outlook|mailbox|inbox|imap|newsletter)\b/),
    T("Automation & Workflows", /\b(automat|shortcuts?\b|workflows?\b|zapier|make\.com|ifttt|applescript|scripts?\b|macro|hotkey|alias)\b/),
    T("Documents & Files", /\b(files?\b|folders?\b|documents?\b|pdf|finder|dropbox|google drive|onedrive|scan|upload|download|archive)\b/),
    T("Writing & Text Tools", /\b(writ|text|grammar|spell|regex|replace|words?\b|markdown|character|dictionary|prompt)\b/),
    T("Reading & Learning", /\b(read|books?\b|anki|flashcards?|learn|study|course|language)\b/),
    T("Team & Business Tools", /\b(airtable|trello|slack|crm|salesforce|hr\b|employee|team|okr|business)\b/),
    T("Search & Bookmarks", /\b(search|bookmarks?\b|history|quick open|launcher|recent|open)\b/),
    T("Trackers & Monitors", /\b(track|monitor|stats|usage|dashboard|status)\b/),
  ],

  Communication: [
    T("Messaging & Chat", /\b(slack|discord|telegram|whatsapp|signal|imessage|messenger|matrix|chats?\b|messages?\b|sms|wechat|beeper|texts?\b)\b/),
    T("Video Calls & Meetings", /\b(zoom|google meet|teams|facetime|webex|calls?\b|meetings?\b|huddle|conference|gather)\b/),
    T("Email", /\b(email|e-mail|gmail|outlook|mail|inbox|newsletter)\b/),
    T("Social & Fediverse", /\b(twitter|tweet|mastodon|bluesky|linkedin|instagram|facebook|reddit|threads|social|fediverse|akkoma|pleroma|farcaster|status|publish|post)\b/),
    T("Customer Support & CRM", /\b(chatwoot|crisp|intercom|zendesk|support|customer|crm|conversations?\b|helpdesk)\b/),
    T("Notifications & Push", /\b(notifications?\b|push|bark|ntfy|pushover|alerts?\b)\b/),
    T("Contacts & People", /\b(contacts?\b|people|phone|address book|employee|profiles?\b)\b/),
    T("Language & Dictionaries", /\b(dictionary|dictionaries|chinese|character|translat|words?\b|language)\b/),
    T("Links & Sharing", /\b(urls?\b|links?\b|shorten|share|qr)\b/),
  ],

  Data: [
    T("Converters & Encoders", /\b(convert|encode|decode|base64|hex|binary|units?\b|transform|parser|csv|json|yaml|formats?\b)\b/),
    T("Generators", /\b(generat|random|uuid|guid|lorem|fake|mock|placeholder|dummy|realistic data)\b/),
    T("Calculators & Math", /\b(calculat|math|percent|arithmetic|equation|statistics|grade)\b/),
    T("Time & Dates", /\b(time|dates?\b|timezone|time zone|epoch|timestamp|cron|duration|countdown)\b/),
    T("Crypto & Blockchain Data", /\b(crypto|bitcoin|blockchain|gas|ethereum|token|defi|coin)\b/),
    T("Web & Network Intelligence", /\b(dig\b|dns|websites?\b|https?\b|domains?\b|ip\b|hosts|scan|observatory|whois|email relay|urls?\b)\b/),
    T("Games & Esports Data", /\b(games?\b|esports?\b|free-to-play|howlongtobeat|players?\b)\b/),
    T("Health, Nature & Science", /\b(birds?\b|plants?\b|animals?\b|workouts?\b|horoscope|emissions?\b|carbon|toxic|periodic|glucose|fitness)\b/),
    T("Travel & Geo Data", /\b(flights?\b|iata|airports?\b|miles|transit|geo\b)\b/),
    T("Business & Databases", /\b(crm|dbt|firestore|spreadsheets?\b|forms?\b|grist|export|import|database|cloud jobs)\b/),
    T("Trackers & Monitors", /\b(track|monitor|stats|uptime|sensor|co2|dashboard|leaderboard|status)\b/),
    T("Text Processing", /\b(text|strings?\b|case|word count|characters?\b|slug|title case|whitespace|array|diff|compare|latex)\b/),
    T("Weather & Environment", /\b(weather|forecast|climate|air quality|aqi|temperature|humidity|sunrise|moon|pollution)\b/),
    T("Files & Archives", /\b(files?\b|archive|compress|extract|zip|checksum|downloads?\b|videos?\b|exif|pdf|images?\b)\b/),
    T("APIs & Scraping", /\b(api|scraping|crawl|supabase|webhooks?\b|endpoint)\b/),
    T("Lookups & References", /\b(lookup|dictionary|definition|wikipedia|grokipedia|iso|country|postal|zip code|http status|directory|search|bible|books?\b|element|lottery|fbi|government|wanted|pricing)\b/),
  ],

  "Design Tools": [
    T("AI Generation", /\b(ai|generat|dall|midjourney|stable diffusion|fal\.ai|prototyp|model)\b/),
    T("Colors & Palettes", /\b(colors?\b|colour|palette|hex\b|rgb|hsl|gradient|contrast|shades?\b)\b/),
    T("Icons & Assets", /\b(icons?\b|svg|assets?\b|emoji|logo|illustration|sticker|favicon|cursors?\b|badge)\b/),
    T("Fonts & Typography", /\b(fonts?\b|typograph|typeface|glyph|lettering)\b/),
    T("Design Apps & Whiteboards", /\b(figma|sketch|framer|adobe|photoshop|illustrator|canva|zeplin|spline|rive|excalidraw|whiteboard|board)\b/),
    T("Screenshots & Mockups", /\b(screenshots?\b|mockup|screen record|capture|annotate|device frame|cut out|image)\b/),
    T("3D & Motion", /\b(3d|blender|models?\b|animation|motion)\b/),
    T("Calculators & Ratios", /\b(ratio|calculat|pixels?\b|viewport|convert|divis|sizes?\b)\b/),
    T("Art & Wallpapers", /\b(wallpapers?\b|art|museum|ascii)\b/),
    T("Inspiration & Galleries", /\b(dribbble|behance|inspiration|gallery|showcase|awwwards|design system|components?\b)\b/),
  ],

  Documentation: [
    T("Language References", /\b(python|rust|swift|javascript|typescript|golang|\bgo\b|java|php|ruby|kotlin|c\+\+|c#|scala|elixir|dart|lua|haskell|bash|clojure)\b/),
    T("Framework & Library Docs", /\b(react|vue|angular|svelte|next\.?js|nuxt|tailwind|laravel|django|rails|flutter|spring|express|bootstrap|chakra|daisyui|components?\b|design system)\b/),
    T("Cheatsheets & Snippets", /\b(cheat ?sheets?|snippets?\b|commands?\b|shortcuts?\b|conventional commits?|reference|big-o|code smells)\b/),
    T("Developer References", /\b(mdn|devdocs|api|man pages?|stack overflow|w3|spec|http|headers?\b|standards?\b|dicom|protocol)\b/),
    T("Wikis & Knowledge Bases", /\b(wiki|confluence|notion|gitbook|readme|affine|docs|documentation|manual|guide|crawl)\b/),
    T("Communities & Blogs", /\b(forum|community|dev community|articles?\b|blogs?\b|medium)\b/),
    T("Dictionaries & Language", /\b(dictionary|dictionaries|characters?\b|words?\b|language|translat)\b/),
  ],

  Finance: [
    T("Crypto & Web3", /\b(crypto|bitcoin|btc|ethereum|eth|blockchain|tokens?\b|coins?\b|wallet|defi|nft|solana|binance|web3|gas|gwei|coingecko|coinpaprika|mining|bitaxe|smart contract)\b/),
    T("Stocks & Trading", /\b(stocks?\b|share price|ticker|markets?\b|nasdaq|s&p|dow|etf|invest|portfolio|dividend|earnings|trading|alpaca|options?\b)\b/),
    T("Currency & Exchange", /\b(currency|currencies|exchange rate|forex|fx\b|convert|indicators?\b|dólar|dolar|dollars?\b|pesos|euro)\b/),
    T("Business, Billing & Sales", /\b(chartmogul|mrr|saas|subscriptions?\b|payments? platform|stripe|invoices?\b|orders?\b|revenue|business|metrics|sales|products?\b|billing|infakt|moneybird|freeagent|gumroad|polar|paymenter|paynow|mollie|creem|qonto|mercury)\b/),
    T("Banking & Payments", /\b(bank|payments?\b|paypal|wise|revolut|bunq|iban|cards?\b|credit)\b/),
    T("Energy & Utility Prices", /\b(energy|tariff|electricity|octopus)\b/),
    T("Regional & Company Lookups", /\b(gst|ifsc|siren|siret|company|companies|vat)\b/),
    T("Personal Finance & Budgeting", /\b(expenses?\b|budget|costs?\b|tax|bookkeep|beancount|deals?\b|price|purchas|assessment|property|firefly|lunch money|moneytree|money|finances?\b|transactions?\b|accounts?\b|balances?\b)\b/),
  ],

  Fun: [
    T("Games & Gaming", /\b(games?\b|gaming|steam|chess|puzzle|wordle|sudoku|trivia|quiz|2048|minesweeper|solitaire|tetris|arcade|balatro|pokemon|esports?\b|twitch|emotes?\b|player|quests?\b|dota|d&d|dungeons|helldivers|decentraland|geoguess\w*|howlongtobeat|heroes)\b/),
    T("AI & Generative Fun", /\b(ai|gpt|chatgpt|openai|dall)\b/),
    T("Emoji, GIFs & Symbols", /\b(emojis?|emojif\w*|kaomoji|ascii|unicode|symbols?\b|emoticon|kawaii|gifs?\b)\b/),
    T("Jokes & Randomness", /\b(jokes?\b|memes?\b|quotes?\b|facts?\b|fortune|random|magic 8|8 ball|dice|coin flip|roast|bored|questions?\b|insults?\b|excuses?\b)\b/),
    T("Sports", /\b(nba|nfl|mlb|nhl|football|soccer|basketball|cricket|tennis|golf|f1|formula|premier league|bundesliga|série|serie a|la liga|sports?\b|matches|standings|fixtures)\b/),
    T("Movies, TV & Anime", /\b(anime|manga|movies?\b|films?\b|tv shows?|series|netflix|imdb|letterboxd|trakt|betaseries)\b/),
    T("Music & Instruments", /\b(guitar|tuner|chords|eurovision|songs?\b|music)\b/),
    T("Pop Culture & Fandom", /\b(star wars|marvel|harry potter|lego|ice and fire|got\b|characters?\b|universe|kanye|taylor swift)\b/),
    T("Generators & Toys", /\b(generat|fancy text|figlet|counters?\b|count|donut|animations?\b|confetti)\b/),
    T("Nature & Exploration", /\b(birds?\b|maps?\b|places|outdoors|groundhog|animals?\b|plants?\b|explor)\b/),
    T("Wallpapers & Effects", /\b(wallpapers?\b|sounds?\b|backgrounds?\b|art)\b/),
    T("Food & Drink", /\b(coffee|cocktail|bar\b|recipes?\b|food|beer|wine|drinks?\b)\b/),
  ],

  Media: [
    T("Music & Audio", /\b(spotify|music|audio|songs?\b|playlist|podcasts?\b|sound|volume|apple music|soundcloud|tidal|lyrics|radio|chords|ableton|airpods|speech|voice)\b/),
    T("Video & Streaming", /\b(youtube|videos?\b|stream|netflix|twitch|vimeo|vlc|iina|mpv|subtitles?\b|apple tv|bilibili|remote)\b/),
    T("Images & Photos", /\b(images?\b|photos?\b|pictures?\b|screenshots?\b|gifs?\b|unsplash|icons?\b|avatars?\b|exif|ocr|badge)\b/),
    T("Wallpapers & Art", /\b(wallpapers?\b|art|museum|film)\b/),
    T("Books & Papers", /\b(books?\b|arxiv|papers?\b|read|library)\b/),
    T("AI Generation", /\b(ai|generat|dall|stable diffusion|fal\.ai|model)\b/),
    T("Conversion, Upload & Download", /\b(download|convert|compress|ffmpeg|transcode|resize|optimi[sz]e|upload|files?\b)\b/),
  ],

  News: [
    T("Tech & Startup News", /\b(hacker news|techcrunch|product hunt|the verge|ars technica|macrumors|tech|startup|indie|lobsters|trending|github)\b/),
    T("Feeds & Readers", /\b(rss|feeds?\b|readers?\b|read later|digest|substack|newsletters?\b|bookmark|articles?\b|posts?\b)\b/),
    T("Sports & Esports News", /\b(espn|sports?\b|esports?\b|football|soccer|cricket|scores?\b|league of legends|valorant|liquipedia|matches)\b/),
    T("Communities & Forums", /\b(indiehackers|bookface|forums?\b|reddit|community|juejin)\b/),
    T("Markets & Predictions", /\b(kalshi|prediction|markets?\b|lottery)\b/),
    T("World & Business", /\b(news|headlines?\b|bbc|cnn|nyt|guardian|reuters|bloomberg|economist|stories)\b/),
  ],

  Security: [
    T("Passwords & Secrets", /\b(passwords?\b|passphrase|1password|bitwarden|keepass|lastpass|dashlane|passbolt|keeper|vault|secrets?\b|passkey|credentials?\b|infisical)\b/),
    T("2FA & Authentication", /\b(2fa|otp|totp|mfa|authenticat|yubikey|login)\b/),
    T("Access & Identity", /\b(okta|entra|roles?\b|admin|privileges?\b|iam|permissions?\b|access|unlock|sso)\b/),
    T("Encryption & Hashing", /\b(encrypt|decrypt|hash|md5|sha\b|gpg|pgp|certificates?\b|ssl|tls|checksum|sign)\b/),
    T("Network & Privacy", /\b(vpn|openvpn|firewall|proxy|tor\b|privacy|trackers?\b|dns|adguard|nextdns|pi-?hole|ip address|breach|leak|osint|delete)\b/),
  ],

  System: [
    T("Apps & Processes", /\b(apps?\b|applications?\b|quit|uninstall|processes?\b|cpu|memory|ram|kill|activity monitor|performance|benchmark|updates?\b|launch)\b/),
    T("Window & Desktop Management", /\b(windows?\b|tiling|desktop|dock|menu ?bar|spaces?\b|stage manager)\b/),
    T("Hardware & Devices", /\b(battery|bluetooth|usb|camera|microphone|keyboards?\b|mouse|trackpad|printers?\b|airpods|devices?\b|fan|temperature|sensors?\b)\b/),
    T("Display & Appearance", /\b(displays?\b|brightness|dark mode|appearance|resolution|night shift|screen ?saver|wallpapers?\b|themes?\b|cursor)\b/),
    T("Audio Control", /\b(volume|mute|sound|audio)\b/),
    T("Power & Session", /\b(sleep|caffeinate|awake|lock|log ?out|shutdown|restart|power|uptime|screen lock)\b/),
    T("Clipboard & Input", /\b(clipboard|paste|input|scroll|shortcuts?\b|keystrokes?\b)\b/),
    T("Files & Storage", /\b(files?\b|folders?\b|trash|disks?\b|storage|finder|hidden|mount|eject|diskutil|volumes?\b)\b/),
    T("Network", /\b(wifi|wi-fi|networks?\b|ip\b|dns|ping|ethernet|hotspot|airdrop|bonjour|proxy)\b/),
    T("Defaults & Services", /\b(defaults?\b|settings|preferences|services?\b|homebrew|daemons?\b|browser)\b/),
  ],

  Web: [
    T("AI Services", /\b(ai|gpt|openai|chatgpt|claude|gemini|scraping|crawl|agents?\b)\b/),
    T("Social & Communities", /\b(social|twitter|mastodon|bluesky|akkoma|reddit|forums?\b|profiles?\b|communit|posts?\b|timeline)\b/),
    T("Search Engines", /\b(search|google|duckduckgo|bing|kagi|perplexity)\b/),
    T("Bookmarks & Read Later", /\b(bookmarks?\b|read later|pocket|instapaper|pinboard|raindrop|omnivore|favorites?\b)\b/),
    T("URL & Domain Tools", /\b(urls?\b|domains?\b|dns|whois|shorten|short link|redirect|qr\b|utm|slug|links?\b)\b/),
    T("Browsers & Tabs", /\b(browsers?\b|chrome|safari|firefox|arc\b|brave|edge|vivaldi|tabs?\b)\b/),
    T("Crypto & Markets", /\b(crypto|bitcoin|binance|price|markets?\b|portfolio)\b/),
    T("Screenshots & Capture", /\b(screenshots?\b|capture|annotate|snapshot)\b/),
    T("Monitoring & SEO", /\b(seo|lighthouse|page ?speed|uptime|analytics|sitemap|meta tags?|open graph|monitor|stats|track)\b/),
    T("Downloads & Torrents", /\b(download|torrents?\b|magnet)\b/),
    T("Web Apps & Services", /\b(apis?\b|services?\b|accounts?\b|platforms?\b|manage|dashboard|client|app\b|lms|hr\b|instance)\b/),
  ],

  Applications: [
    T("AI & Chat Apps", /\b(ai|chatgpt|claude|gemini|ollama|copilot|transcri|ocr|prototyp)\b/),
    T("Notes, PKM & Study Apps", /\b(notion|obsidian|anytype|bear|craft|evernote|anki|notes?\b|bookmarks?\b|bible|study|flashcards?)\b/),
    T("Productivity & Task Apps", /\b(things|todoist|omnifocus|tasks?\b|todo|trello|airtable|calendar|reminders?\b)\b/),
    T("Music & Audio Apps", /\b(ableton|spotify|music|audio|logic pro|garageband|sonos|djay|cider|endel|players?\b)\b/),
    T("Media & Photo Apps", /\b(photos?\b|videos?\b|vlc|plex|iina|screen ?shoo?ts?\b|cleanshot|capture|record|camera|obs\b|images?\b|bilibili)\b/),
    T("Reading & Library Apps", /\b(calibre|ebooks?\b|feedbin|rss|readers?\b|bib\w*|books?\b|articles?\b)\b/),
    T("Automation & Input Apps", /\b(bettertouchtool|btt\b|espanso|keyboard maestro|drafts|actions?\b|automat|snippets?\b|text expan)\b/),
    T("Content & CMS Apps", /\b(contentful|cms|contents?\b|assets?\b|datawrapper|documents?\b|lark|feishu)\b/),
    T("Network & Connection Apps", /\b(vpn|warp|cyberduck|ftp|connections?\b|hosts|ip address|dns|proxy)\b/),
    T("Analytics & Stats Apps", /\b(analytics|stats|fathom|plausible)\b/),
    T("Developer Apps", /\b(vs ?code|vscode|jetbrains|intellij|iterm|terminal|docker|tower|fork|xcode|simulator|localhost)\b/),
    T("Design Apps", /\b(figma|sketch|adobe|photoshop|illustrator|canva|framer)\b/),
    T("Browsers", /\b(chrome|firefox|arc\b|brave|edge|vivaldi|orion|safari|browsers?\b|tabs?\b)\b/),
    T("Window Managers & Utilities", /\b(windows?\b|tiling|aerospace|bartender|menu ?bar|utilit|manager|cleaner|keeper)\b/),
    T("Apple & Built-in Apps", /\b(imessage|facetime|keynote|pages|numbers|shortcuts app|app store|testflight|apple|macos|finder)\b/),
    T("Files, Sync & Upload", /\b(files?\b|uploads?\b|downloads?\b|sync|dropbox|drive|transfer|torrents?\b)\b/),
    T("Faith & Lifestyle Apps", /\b(prayer|adhan|quran|meditat|workout|fitness|recipes?\b)\b/),
    T("Launchers & App Control", /\b(launch|quit|open app|uninstall|switch|control|companion)\b/),
  ],
};

// Broad, cross-domain rules for "Other", "Uncategorized", and any category
// upstream introduces that has no taxonomy yet.
const GLOBAL_TAXONOMY = [
  T("AI Tools", /\b(ai|llm|gpt|openai|chatgpt|claude|copilot|gemini|ollama|prompt|chatbots?\b|transcri|scraping|apify)\b/),
  T("Crypto & Trading", /\b(crypto|bitcoin|binance|bitfinex|portfolio|trading|stocks?\b|exchange rate|currency|currencies)\b/),
  T("Developer Utilities", /\b(git|github|apis?\b|code|json|regex|terminal|adb|docker|sql|debug|deploy|checksum|hash|documentation|docs|proxy|clash|lint)\b/),
  T("Productivity & Tasks", /\b(todo|tasks?\b|notes?\b|calendar|meetings?\b|reminders?\b|clipboard|focus|pomodoro|time track|clockify|alias|launcher|bookmarks?\b)\b/),
  T("Media & Entertainment", /\b(music|spotify|videos?\b|youtube|photos?\b|images?\b|podcasts?\b|movies?\b|games?\b|wallpapers?\b|art\b|emote)\b/),
  T("Language & Translation", /\b(translat|dictionary|dictionaries|language|words?\b|grammar|thesaurus|vocabulary|hebrew|chinese)\b/),
  T("Health & Lifestyle", /\b(health|fitness|workouts?\b|meditat|recipes?\b|food|coffee|water|sleep|prayer|adhan|habits?\b|glucose|pollution)\b/),
  T("Travel & Transport", /\b(travel|flights?\b|trains?\b|transit|transport|bus\b|metro|maps?\b|uber|bikes?\b|stations?\b|departures?\b|weather|airport|city)\b/),
  T("Smart Home & IoT", /\b(govee|hue|lights?\b|home assistant|homekit|iot|3d printer|bambu|camera|thermostat)\b/),
  T("System & Hardware", /\b(battery|displays?\b|volume|audio|wifi|bluetooth|cpu|windows?\b|keyboards?\b|scroll|apps?\b|macos)\b/),
  T("Web & Search", /\b(search|browsers?\b|urls?\b|websites?\b|domains?\b|links?\b|lms|account)\b/),
  T("Communication & Social", /\b(chats?\b|messages?\b|slack|discord|email|mail|twitter|social|telegram)\b/),
  T("Education & Learning", /\b(anki|flashcards?|learn|study|courses?\b|school|university|canvas|exam)\b/),
];

const FALLBACK = "General";

/**
 * Editorial grouping of each category's subcategories into sections, used on
 * category pages instead of one flat topic table. Subcategories that are
 * missing here (renamed rules, drift) fall into a "More topics" section;
 * auto-discovered groups always render under "Discovered topics". The "*"
 * entry serves Other, Uncategorized, and any unknown category (they share the
 * global taxonomy).
 */
export const SUBCATEGORY_SECTIONS = {
  "Developer Tools": [
    ["Code & Collaboration", ["Git & Version Control", "Issue Tracking & Projects", "Code, Snippets & Text Utilities", "Search & Reference"]],
    ["Build, Ship & Operate", ["CI/CD & DevOps", "Cloud, Hosting & Infrastructure", "Databases", "APIs & Networking", "Monitoring & Logs"]],
    ["Platforms & Ecosystems", ["AI & LLM Tools", "Web & Frontend", "Mobile & App Development", "Web3 & Blockchain"]],
    ["Tooling & Workflow", ["Terminal & Editors", "Package & Dependency Tools", "Automation & Scripting", "Files & Transfer", "Design & Assets"]],
  ],
  Productivity: [
    ["Organize & Plan", ["Tasks & To-Dos", "Calendar & Scheduling", "Notes & Knowledge", "Time Tracking & Focus"]],
    ["Write & Create", ["AI & Assistants", "Writing & Text Tools", "Documents & Files", "Email"]],
    ["Workflow & Speed", ["Automation & Workflows", "Clipboard & Text Expansion", "Window & Workspace Management", "Search & Bookmarks"]],
    ["Learn & Collaborate", ["Reading & Learning", "Team & Business Tools", "Trackers & Monitors"]],
  ],
  Communication: [
    ["Conversations", ["Messaging & Chat", "Video Calls & Meetings", "Email"]],
    ["Social & Sharing", ["Social & Fediverse", "Links & Sharing", "Notifications & Push"]],
    ["People & Support", ["Contacts & People", "Customer Support & CRM", "Language & Dictionaries"]],
  ],
  Data: [
    ["Transform & Generate", ["Converters & Encoders", "Generators", "Text Processing", "Files & Archives"]],
    ["Calculate & Measure", ["Calculators & Math", "Time & Dates", "Trackers & Monitors", "Weather & Environment"]],
    ["Domain Data", ["Crypto & Blockchain Data", "Games & Esports Data", "Health, Nature & Science", "Travel & Geo Data", "Business & Databases"]],
    ["Lookup & Fetch", ["Lookups & References", "Web & Network Intelligence", "APIs & Scraping"]],
  ],
  "Design Tools": [
    ["Visual Elements", ["Colors & Palettes", "Icons & Assets", "Fonts & Typography"]],
    ["Create & Capture", ["Design Apps & Whiteboards", "Screenshots & Mockups", "AI Generation", "3D & Motion"]],
    ["Reference & Inspiration", ["Inspiration & Galleries", "Art & Wallpapers", "Calculators & Ratios"]],
  ],
  Documentation: [
    ["Programming Docs", ["Language References", "Framework & Library Docs", "Developer References"]],
    ["Quick Reference", ["Cheatsheets & Snippets", "Dictionaries & Language"]],
    ["Knowledge & Community", ["Wikis & Knowledge Bases", "Communities & Blogs"]],
  ],
  Finance: [
    ["Markets & Investing", ["Stocks & Trading", "Crypto & Web3", "Currency & Exchange"]],
    ["Money Management", ["Personal Finance & Budgeting", "Banking & Payments"]],
    ["Business & Reference", ["Business, Billing & Sales", "Regional & Company Lookups", "Energy & Utility Prices"]],
  ],
  Fun: [
    ["Play", ["Games & Gaming", "Jokes & Randomness", "Generators & Toys", "AI & Generative Fun"]],
    ["Watch & Listen", ["Movies, TV & Anime", "Music & Instruments", "Sports", "Pop Culture & Fandom"]],
    ["Express & Explore", ["Emoji, GIFs & Symbols", "Wallpapers & Effects", "Nature & Exploration", "Food & Drink"]],
  ],
  Media: [
    ["Listen & Watch", ["Music & Audio", "Video & Streaming"]],
    ["Look & Read", ["Images & Photos", "Wallpapers & Art", "Books & Papers"]],
    ["Create & Convert", ["AI Generation", "Conversion, Upload & Download"]],
  ],
  News: [
    ["Topics", ["Tech & Startup News", "Sports & Esports News", "World & Business", "Markets & Predictions"]],
    ["Read & Discuss", ["Feeds & Readers", "Communities & Forums"]],
  ],
  Security: [
    ["Credentials & Access", ["Passwords & Secrets", "2FA & Authentication", "Access & Identity"]],
    ["Protect & Encrypt", ["Encryption & Hashing", "Network & Privacy"]],
  ],
  System: [
    ["Apps & Windows", ["Apps & Processes", "Window & Desktop Management"]],
    ["Hardware & Output", ["Hardware & Devices", "Display & Appearance", "Audio Control"]],
    ["Files & Input", ["Files & Storage", "Clipboard & Input"]],
    ["Power, Network & Settings", ["Power & Session", "Network", "Defaults & Services"]],
  ],
  Web: [
    ["Browse & Search", ["Search Engines", "Browsers & Tabs", "Bookmarks & Read Later"]],
    ["Sites & Domains", ["URL & Domain Tools", "Monitoring & SEO", "Screenshots & Capture", "Downloads & Torrents"]],
    ["Services & Communities", ["Web Apps & Services", "Social & Communities", "AI Services", "Crypto & Markets"]],
  ],
  Applications: [
    ["Work & Knowledge Apps", ["Notes, PKM & Study Apps", "Productivity & Task Apps", "AI & Chat Apps", "Reading & Library Apps", "Content & CMS Apps"]],
    ["Media & Creative Apps", ["Music & Audio Apps", "Media & Photo Apps", "Design Apps"]],
    ["Developer & Power-User Apps", ["Developer Apps", "Automation & Input Apps", "Network & Connection Apps", "Analytics & Stats Apps", "Window Managers & Utilities"]],
    ["Everyday Apps", ["Browsers", "Apple & Built-in Apps", "Files, Sync & Upload", "Faith & Lifestyle Apps", "Launchers & App Control"]],
  ],
  "*": [
    ["Digital Tools", ["AI Tools", "Developer Utilities", "Productivity & Tasks", "Web & Search", "System & Hardware"]],
    ["Life & World", ["Health & Lifestyle", "Travel & Transport", "Smart Home & IoT", "Education & Learning"]],
    ["Media, Money & Words", ["Media & Entertainment", "Communication & Social", "Crypto & Trading", "Language & Translation"]],
  ],
};

/** Section layout for a category's subcategories ("*" fallback). */
export function sectionsForCategory(category) {
  return SUBCATEGORY_SECTIONS[category] ?? SUBCATEGORY_SECTIONS["*"];
}

/**
 * Editorial grouping of the top-level store categories into sections, used
 * wherever a list of categories is rendered. Categories upstream introduces
 * that aren't listed here are appended in a trailing "More" section.
 */
export const CATEGORY_SECTIONS = [
  ["Work & Productivity", ["Productivity", "Applications", "Communication"]],
  ["Development", ["Developer Tools", "Documentation", "Data", "Security"]],
  ["Creative & Media", ["Design Tools", "Media"]],
  ["Web, Finance & News", ["Web", "Finance", "News"]],
  ["System & Utilities", ["System", "Other"]],
  ["Fun & Entertainment", ["Fun"]],
  ["Uncategorized", ["Uncategorized"]],
];

/** Ordered subcategory names for a category (General always last). */
export function subcategoriesOf(category) {
  const rules = TAXONOMIES[category] ?? GLOBAL_TAXONOMY;
  return [...rules.map(([name]) => name), FALLBACK];
}

/** First matching subcategory for an extension entry within a category. */
export function classify(entry, category) {
  const hay = `${entry.title} ${entry.name} ${entry.description}`.toLowerCase();
  const rules = TAXONOMIES[category] ?? GLOBAL_TAXONOMY;
  for (const [name, pattern] of rules) {
    if (pattern.test(hay)) return name;
  }
  return FALLBACK;
}
