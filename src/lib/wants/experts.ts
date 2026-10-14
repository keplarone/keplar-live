/**
 * Keplar Wants: the 128 experts. Each expert is a specialist role (a focus, the words that wake it, and the kind of model work
 * it needs) run on Keplar's existing model roster. The Active Routing Gate (gate.ts) reads a want and wakes 2–3 of them;
 * the other 125 stay asleep and cost nothing. Pure data, unit-tested in tests/wants.test.ts (128 experts, unique ids).
 *
 * Row: [name, domain, focus, keywords (comma separated; multi-word phrases score higher), work kind]
 */
export type WantsDomain =
  | "software" | "games" | "business" | "money" | "commerce" | "food" | "travel" | "finance" | "legal" | "health"
  | "science" | "creative" | "media" | "education" | "home" | "marketing" | "data" | "life";

export type WorkKind = "reason" | "code" | "write" | "research" | "math";

export type Expert = { n: number; id: string; name: string; domain: WantsDomain; focus: string; keywords: string[]; work: WorkKind };

type Row = [name: string, domain: WantsDomain, focus: string, keywords: string, work: WorkKind];

const ROWS: Row[] = [
  // ── software (1–16)
  ["Full-Stack Architect", "software", "end-to-end web app architecture: data model, API, auth, hosting", "app,web app,website,full stack,backend,frontend,architecture,saas,platform,build an app", "code"],
  ["React & Next.js Engineer", "software", "React and Next.js interfaces, routing, state and server components", "react,next.js,nextjs,component,ui,frontend,jsx,tsx,hooks", "code"],
  ["Mobile App Engineer", "software", "iPhone and Android apps (React Native, Swift, Kotlin), app store release", "mobile,ios,android,iphone,app store,play store,swift,kotlin,react native,phone app", "code"],
  ["Python Engineer", "software", "Python scripts, automation, APIs and packaging", "python,script,automation,django,flask,fastapi,pandas,pip", "code"],
  ["Database Designer", "software", "schemas, indexes, migrations and queries (Postgres, SQLite, Mongo)", "database,sql,postgres,mysql,sqlite,mongo,schema,query,table", "code"],
  ["API & Integrations Engineer", "software", "REST/GraphQL APIs, webhooks, OAuth and third-party integrations", "api,integration,webhook,oauth,graphql,rest,connect,connector,zapier", "code"],
  ["DevOps & Cloud Engineer", "software", "deployment, CI/CD, containers, domains and cloud hosting", "deploy,hosting,server,docker,kubernetes,ci,cloud,aws,vercel,domain,dns", "code"],
  ["Security Engineer", "software", "authentication, secure defaults, threat modelling and safe handling of personal data", "security,secure,auth,login,password,encryption,vulnerability,privacy,2fa", "reason"],
  ["Debugging Specialist", "software", "reading errors and stack traces, isolating root causes and fixing bugs", "bug,error,crash,debug,fix,broken,exception,stack trace,not working", "code"],
  ["UI/UX Designer", "software", "layouts, flows, accessibility and visual polish for screens", "design,ux,ui,layout,user experience,wireframe,figma,interface,accessible", "write"],
  ["Browser Extension Engineer", "software", "Chrome/Firefox extensions and browser automation", "extension,chrome extension,browser,addon,plugin,userscript", "code"],
  ["Desktop App Engineer", "software", "desktop apps (Electron, Tauri) for Mac and Windows", "desktop,electron,tauri,mac app,windows app,native app", "code"],
  ["Automation & Bots Engineer", "software", "bots and scheduled automations (Discord, Telegram, Slack, cron jobs)", "bot,discord,telegram,slack,automate,automation,scheduler,cron", "code"],
  ["Algorithms Specialist", "software", "algorithms, data structures and performance", "algorithm,data structure,performance,optimize,complexity,leetcode,faster", "math"],
  ["Testing & QA Engineer", "software", "tests, test plans and release checks", "test,testing,qa,unit test,e2e,quality,coverage", "code"],
  ["Open Source & Git Expert", "software", "Git, GitHub workflows, licenses and open-source projects", "git,github,repository,repo,open source,pull request,license", "code"],
  // ── games (17–24)
  ["Roblox Developer", "games", "Roblox games in Luau: places, scripts, DataStores, monetization with Robux", "roblox,luau,robux,obby,tycoon,simulator,roblox studio,roblox game", "code"],
  ["Game Designer", "games", "core loops, mechanics, progression, balance and player retention", "game,game design,mechanic,level,gameplay,progression,player,quest", "write"],
  ["Unity & Unreal Developer", "games", "Unity (C#) and Unreal (C++/Blueprints) games", "unity,unreal,c#,blueprint,godot,game engine,3d game", "code"],
  ["Web & Mobile Game Developer", "games", "browser and phone games (canvas, Phaser, three.js)", "html5 game,phaser,canvas,browser game,mobile game,three.js,arcade", "code"],
  ["3D Artist & Blender Expert", "games", "3D models, materials, rigging and animation in Blender", "3d,blender,model,mesh,render,animation,rig,texture", "write"],
  ["Game Economy Designer", "games", "in-game currencies, shops, gamepasses and fair monetization", "game economy,gamepass,in-game currency,shop,monetize game,microtransaction", "math"],
  ["Minecraft & Modding Expert", "games", "Minecraft servers, mods, plugins and datapacks", "minecraft,mod,modding,server,plugin,datapack,spigot,fabric", "code"],
  ["Esports & Streaming Coach", "games", "competitive play, streaming setup and growing a gaming channel", "esports,twitch,stream,streaming,gaming channel,rank,competitive", "write"],
  // ── business (25–40)
  ["Startup Strategist", "business", "turning an idea into a business: model, positioning, first customers", "business,startup,company,idea,launch,founder,venture,start a business", "reason"],
  ["Niche Finder", "business", "finding profitable niches and validating demand quickly", "niche,market,demand,validate,opportunity,trend,profitable", "research"],
  ["E-commerce Operator", "business", "online stores (Shopify, Etsy, Amazon), products, suppliers and fulfillment", "ecommerce,e-commerce,shopify,etsy,amazon,store,online store,dropshipping,product", "reason"],
  ["Business Plan Writer", "business", "business plans, one-pagers and investor decks", "business plan,pitch,deck,investor,one pager,executive summary", "write"],
  ["Pricing Strategist", "business", "pricing, packaging, margins and unit economics", "pricing,price,margin,unit economics,subscription,charge,profit", "math"],
  ["Sales Closer", "business", "outreach, sales scripts, objection handling and closing", "sales,sell,close,outreach,cold email,lead,prospect,pipeline", "write"],
  ["Operations Manager", "business", "processes, hiring, tools and running day-to-day operations", "operations,process,hire,hiring,team,workflow,sop,manage", "reason"],
  ["Local Business Advisor", "business", "brick-and-mortar and service businesses: permits, location, local customers", "local business,restaurant,cafe,salon,shop,cleaning business,lawn,food truck", "reason"],
  ["Agency & Freelance Advisor", "business", "freelancing and agencies: offers, clients, contracts and rates", "freelance,freelancer,agency,client,upwork,fiverr,consulting,contract work", "reason"],
  ["Fundraising Advisor", "business", "raising money: angels, VCs, grants, crowdfunding", "fundraising,raise money,vc,angel,seed,grant,kickstarter,crowdfunding", "reason"],
  ["Customer Support Designer", "business", "support flows, help centers and customer happiness", "customer support,support,help center,refund,customer service,complaint", "write"],
  ["Supply Chain Expert", "business", "sourcing, manufacturers, inventory and shipping", "supplier,manufacturer,alibaba,inventory,shipping,logistics,wholesale", "research"],
  ["SaaS Builder", "business", "software-as-a-service products: MVP scope, onboarding, churn, MRR", "saas,mrr,churn,onboarding,mvp,software business,b2b", "reason"],
  ["Franchise & Acquisition Advisor", "business", "buying a business or franchise, valuation and due diligence", "franchise,acquire,acquisition,buy a business,valuation,due diligence", "math"],
  ["Nonprofit Advisor", "business", "nonprofits, charities, volunteers and donations", "nonprofit,charity,donation,volunteer,501c3,foundation", "write"],
  ["Product Manager", "business", "product requirements, roadmaps, priorities and user research", "product,roadmap,feature,requirements,prd,user research,prioritize", "reason"],
  // ── money (41–48)
  ["Wealth Builder", "money", "realistic paths to large money goals, milestones and timelines", "million,millionaire,rich,wealth,money,make money,income,dollars,get rich", "reason"],
  ["Side Hustle Scout", "money", "side hustles that fit someone's time, skills and starting money", "side hustle,extra money,part time,gig,earn,quick money,passive income", "research"],
  ["Content Creator Coach", "money", "growing and monetizing YouTube, TikTok, Instagram and podcasts", "content creation,youtube,tiktok,instagram,influencer,creator,podcast,followers,views", "write"],
  ["Investing Educator", "money", "index funds, stocks, risk, compounding — education, not personal financial advice", "invest,investing,stock,stocks,index fund,etf,portfolio,compound,dividend", "math"],
  ["Real Estate Advisor", "money", "rentals, house hacking, flipping and real estate math", "real estate,property,rental,landlord,flip,house hacking,mortgage,airbnb host", "math"],
  ["Career Accelerator", "money", "raises, promotions, job switching and high-paying careers", "job,career,raise,promotion,salary,resume,interview,hired", "write"],
  ["Crypto Analyst", "money", "crypto and blockchain basics, risks and scams to avoid", "crypto,bitcoin,ethereum,blockchain,nft,token,defi,wallet", "research"],
  ["Digital Products Seller", "money", "courses, templates, ebooks and other digital products", "digital product,course,ebook,template,gumroad,notion template,printables", "write"],
  // ── commerce (49–56)
  ["Personal Shopper", "commerce", "finding the right product at the right price and comparing options", "buy,shop,shopping,purchase,product,best,deal,cheapest,order", "research"],
  ["Deal Hunter", "commerce", "coupons, discounts, cashback and price tracking", "deal,coupon,discount,sale,promo code,cashback,cheap,price drop", "research"],
  ["Gift Concierge", "commerce", "thoughtful gifts for any person, budget and occasion", "gift,present,birthday,anniversary,christmas,valentine,surprise", "write"],
  ["Electronics Advisor", "commerce", "phones, laptops, PCs, cameras and gadgets", "phone,laptop,computer,pc,gpu,camera,headphones,tv,gadget,iphone", "research"],
  ["Fashion Stylist", "commerce", "outfits, sizing, brands and personal style", "clothes,outfit,fashion,style,shoes,dress,sneakers,wardrobe", "write"],
  ["Car Buying Advisor", "commerce", "buying, leasing and selling cars", "car,vehicle,lease,dealership,used car,truck,ev,tesla", "research"],
  ["Ticket & Events Finder", "commerce", "concerts, sports, shows and event tickets", "ticket,tickets,concert,game tickets,show,event,festival,seats", "research"],
  ["Returns & Warranty Helper", "commerce", "returns, refunds, warranties and disputes with sellers", "return,refund,warranty,dispute,chargeback,broken item", "write"],
  // ── food (57–62)
  ["Coffee & Café Expert", "food", "coffee drinks, cafés, beans and brewing", "coffee,latte,espresso,cappuccino,cold brew,cafe,starbucks,mocha,americano,frappuccino", "research"],
  ["Food Delivery Concierge", "food", "ordering food for delivery or pickup (DoorDash, Uber Eats, Grubhub)", "food,delivery,doordash,uber eats,grubhub,order food,takeout,pizza,burger,hungry,lunch,dinner", "research"],
  ["Chef & Recipe Developer", "food", "recipes, meal prep and cooking techniques", "recipe,cook,cooking,bake,meal,meal prep,ingredients,kitchen", "write"],
  ["Nutritionist", "food", "balanced eating, macros and diets — general guidance, not medical advice", "nutrition,diet,calories,protein,macros,healthy eating,vegan,keto", "reason"],
  ["Restaurant Scout", "food", "finding and booking restaurants", "restaurant,reservation,dine,brunch,sushi,steakhouse,table for", "research"],
  ["Grocery Planner", "food", "grocery lists, budgets and grocery delivery", "grocery,groceries,instacart,supermarket,shopping list", "reason"],
  // ── travel (63–70)
  ["Trip Planner", "travel", "itineraries, budgets and everything about a trip", "trip,travel,vacation,holiday,itinerary,visit,getaway,tour", "research"],
  ["Stays & Airbnb Finder", "travel", "Airbnb, hotels and vacation rentals", "airbnb,hotel,stay,vrbo,booking,rental,lodging,accommodation,room", "research"],
  ["Flight Finder", "travel", "flights, fares, routes and airline rules", "flight,flights,airline,plane,fly,airport,fare,ticket to", "research"],
  ["Local Transport Guide", "travel", "rides, trains, buses and car rentals", "uber,lyft,ride,train,bus,car rental,taxi,transit,subway", "research"],
  ["Visa & Documents Advisor", "travel", "passports, visas and entry rules", "visa,passport,entry requirements,customs,immigration,esta", "research"],
  ["Adventure & Outdoors Guide", "travel", "hiking, camping, national parks and outdoor gear", "hike,hiking,camping,national park,outdoors,trail,ski,surf", "write"],
  ["Events & Party Planner", "travel", "parties, weddings and events: venues, vendors and schedules", "party,wedding,event,venue,celebration,planner,catering", "reason"],
  ["Moving & Relocation Helper", "travel", "moving homes and cities: movers, checklists, costs", "move,moving,relocate,movers,new city,apartment hunting", "reason"],
  // ── finance (71–76)
  ["Budget Coach", "finance", "budgets, saving and getting out of debt", "budget,save,saving,debt,credit card,expenses,spending", "math"],
  ["Tax Explainer", "finance", "how taxes work and what to ask a tax professional", "tax,taxes,irs,deduction,refund,1099,w2,filing", "math"],
  ["Credit Score Coach", "finance", "credit scores, reports and building credit", "credit score,credit report,fico,build credit,loan approval", "reason"],
  ["Loans & Mortgages Explainer", "finance", "loans, mortgages, rates and refinancing", "loan,mortgage,refinance,interest rate,apr,student loan", "math"],
  ["Insurance Explainer", "finance", "health, car, home and life insurance options", "insurance,premium,deductible,coverage,policy,claim", "reason"],
  ["Retirement Planner", "finance", "retirement accounts and long-term planning (education, not advice)", "retirement,401k,ira,roth,pension,retire early,fire", "math"],
  // ── legal (77–80)
  ["Contracts Explainer", "legal", "reading and drafting plain-language contracts (not legal advice)", "contract,agreement,terms,nda,clause,sign", "write"],
  ["Business Formation Guide", "legal", "LLCs, sole proprietorships, EINs and licenses", "llc,incorporate,ein,business license,sole proprietor,register business", "reason"],
  ["Intellectual Property Guide", "legal", "trademarks, copyright and protecting ideas", "trademark,copyright,patent,ip,intellectual property,brand name", "reason"],
  ["Consumer Rights Guide", "legal", "tenant, consumer and employment rights basics", "tenant,landlord dispute,rights,consumer,small claims,employment law", "reason"],
  // ── health (81–86)
  ["Fitness Coach", "health", "workout plans, strength, running and habits", "workout,gym,fitness,exercise,muscle,lose weight,run,training", "write"],
  ["Sleep & Wellness Coach", "health", "sleep, stress and daily wellbeing habits", "sleep,stress,wellness,meditation,relax,energy,burnout", "write"],
  ["Health Information Guide", "health", "explaining symptoms and when to see a doctor (not a diagnosis)", "health,symptom,doctor,pain,medicine,sick,medical", "research"],
  ["Mental Health Supporter", "health", "kind support, coping skills and finding professional help", "anxious,anxiety,depressed,lonely,sad,therapy,therapist,mental health", "write"],
  ["Appointment Booker", "health", "finding and booking doctors, dentists and services", "appointment,book a doctor,dentist,haircut,barber,schedule appointment", "research"],
  ["Beauty & Skincare Advisor", "health", "skincare, haircare and beauty routines", "skincare,skin,hair,makeup,beauty,acne,routine", "write"],
  // ── science (87–96)
  ["Mathematician", "science", "solving and explaining math, from algebra to proofs", "math,equation,algebra,calculus,proof,solve,geometry,statistics", "math"],
  ["Physicist", "science", "physics concepts, problems and simulations", "physics,force,energy,quantum,relativity,motion,electricity", "math"],
  ["Chemist", "science", "chemistry concepts and safe lab practice", "chemistry,chemical,reaction,molecule,element,compound", "reason"],
  ["Biologist", "science", "biology, genetics and life sciences", "biology,cell,dna,gene,genetics,evolution,organism,molecular", "reason"],
  ["Engineer (Mechanical & Electrical)", "science", "hardware, circuits, Arduino, 3D printing and mechanical design", "arduino,raspberry pi,circuit,electronics,3d print,cad,robot,mechanical", "reason"],
  ["Data Scientist", "science", "data analysis, statistics, charts and experiments", "data,analysis,analytics,chart,dataset,statistics,excel,spreadsheet", "math"],
  ["Machine Learning Engineer", "science", "ML models, training, evaluation and AI apps", "machine learning,ml,ai,model,neural network,train,llm,chatbot,gpt", "code"],
  ["Researcher", "science", "deep research across sources with citations", "research,study,paper,sources,evidence,compare,report,investigate", "research"],
  ["Fact Checker", "science", "checking claims against reliable sources", "fact,true,false,verify,claim,myth,is it true", "research"],
  ["Astronomer & Space Expert", "science", "space, astronomy and rockets", "space,planet,star,nasa,rocket,astronomy,telescope,mars", "reason"],
  // ── creative (97–104)
  ["Writer & Editor", "creative", "clear writing: essays, articles, editing and rewriting", "write,essay,article,edit,rewrite,blog,proofread,story", "write"],
  ["Novelist & Storyteller", "creative", "fiction, characters, plots and worldbuilding", "novel,fiction,character,plot,book,worldbuilding,chapter,story idea", "write"],
  ["Songwriter & Music Producer", "creative", "lyrics, melodies, beats and music production", "song,lyrics,music,beat,rap,producer,melody,album", "write"],
  ["Graphic Designer", "creative", "logos, brand identity, posters and visuals", "logo,brand,branding,poster,graphic,flyer,banner,icon,thumbnail", "write"],
  ["Video Producer", "creative", "scripts, shot lists, editing and video content", "video,edit video,script,film,shoot,reel,short,premiere", "write"],
  ["Photographer", "creative", "photography, lighting and editing photos", "photo,photography,lighting,lightroom,portrait,camera settings", "write"],
  ["Comedian & Copy Punch-Up", "creative", "humor, jokes, captions and punchy copy", "funny,joke,caption,meme,humor,roast,pun", "write"],
  ["Speechwriter", "creative", "speeches, toasts and presentations", "speech,toast,presentation,talk,eulogy,wedding speech", "write"],
  // ── media & marketing (105–112)
  ["SEO Specialist", "marketing", "search rankings, keywords and site traffic", "seo,google ranking,keywords,traffic,search engine,backlinks", "research"],
  ["Social Media Manager", "marketing", "content calendars, posts and growing an audience", "social media,post,content calendar,followers,engagement,twitter,x,linkedin", "write"],
  ["Paid Ads Specialist", "marketing", "Google, Meta and TikTok ads: targeting, budgets and creatives", "ads,advertising,facebook ads,google ads,tiktok ads,ppc,campaign,cpc", "math"],
  ["Email Marketer", "marketing", "newsletters, email funnels and automations", "email,newsletter,mailchimp,funnel,email list,subscribers", "write"],
  ["Brand Strategist", "marketing", "brand names, positioning and messaging", "brand name,name ideas,slogan,tagline,positioning,messaging", "write"],
  ["Copywriter", "marketing", "landing pages, product descriptions and persuasive copy", "copy,copywriting,landing page,headline,product description,sales page", "write"],
  ["Growth Hacker", "marketing", "fast, cheap experiments to get users", "growth,users,viral,referral,launch,product hunt,acquisition", "reason"],
  ["PR & Media Relations", "media", "press releases, pitching journalists and reputation", "press,pr,press release,journalist,media,news,reputation", "write"],
  // ── education (113–118)
  ["Tutor", "education", "explaining any school subject step by step", "homework,explain,learn,tutor,class,school,lesson,understand", "reason"],
  ["Language Teacher", "education", "learning and translating languages", "spanish,french,language,translate,translation,japanese,learn english", "write"],
  ["Exam Coach", "education", "SAT, ACT, AP, GCSE and exam strategy", "exam,test prep,sat,act,ap,gcse,study plan,quiz", "reason"],
  ["College Admissions Advisor", "education", "college choice, essays and applications", "college,university,admissions,application essay,scholarship,major", "write"],
  ["Coding Teacher", "education", "learning to program from zero", "learn to code,learn coding,programming for beginners,coding course,bootcamp", "write"],
  ["Skills Coach", "education", "learning any practical skill fast", "learn,skill,how to get better,practice,master,guitar,piano,draw", "write"],
  // ── home & life (119–124)
  ["Home Repair Pro", "home", "DIY repairs and when to call a pro", "repair,fix my,leak,plumbing,diy,broken,install,drywall", "reason"],
  ["Interior Designer", "home", "rooms, furniture and decor", "interior,decor,furniture,room,living room,bedroom,paint color", "write"],
  ["Gardener", "home", "plants, gardens and lawns", "garden,plant,plants,lawn,grow,vegetables,flowers", "write"],
  ["Pet Expert", "home", "pets: care, training and supplies", "dog,cat,pet,puppy,kitten,vet,pet food", "write"],
  ["Life Admin Assistant", "life", "forms, schedules, reminders and paperwork", "schedule,calendar,reminder,form,paperwork,organize,errand,plan my day", "reason"],
  ["Relationship Advisor", "life", "friendships, dating and family relationships", "relationship,dating,girlfriend,boyfriend,friend,family,wife,husband,date idea", "write"],
  // ── data / meta (125–128)
  ["Spreadsheet Wizard", "data", "Excel and Google Sheets formulas, models and dashboards", "excel,google sheets,spreadsheet,formula,pivot,vlookup,dashboard", "math"],
  ["Web Researcher", "data", "searching the live web and summarizing what it finds", "search,find,look up,latest,news,today,current,near me,price of", "research"],
  ["Connector Builder", "data", "connecting Keplar to new services: MCP servers, APIs, OAuth apps and browser workflows", "connect,connection,integrate,link my,api key,mcp,account,sync", "code"],
  ["Generalist Problem Solver", "life", "any goal: breaks it down and finds a practical path", "help,want,need,how,plan,goal,idea,anything", "reason"],
];

const slug = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const EXPERTS: readonly Expert[] = ROWS.map(([name, domain, focus, keywords, work], i) => ({
  n: i + 1,
  id: slug(name),
  name,
  domain,
  focus,
  keywords: keywords.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean),
  work,
}));

export const EXPERT_BY_ID = new Map(EXPERTS.map((e) => [e.id, e]));
export const GENERALIST = EXPERTS[EXPERTS.length - 1]!;

/** The system prompt an expert works under. */
export function expertSystem(e: Expert): string {
  return `You are Expert #${e.n} of 128 in Keplar Wants: ${e.name}. Your specialty: ${e.focus}.
You were woken up by Keplar's routing gate for one sub-task. Do that sub-task with real, specific, usable output (exact steps, names, numbers, code or copy), not generic advice.
Be resourceful: if the obvious route is blocked, give the best legitimate alternative route that still gets the person what they want. Never invent facts, prices, availability or links; say what must be checked live.`;
}
