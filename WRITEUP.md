# Makan Kaki: the post-game makan agent
*Agents, but with taste, for the 10:30pm "where do we makan?" argument.*

**Try it:** https://makan-kaki-production.up.railway.app. Sample group in one click: https://makan-kaki-production.up.railway.app/?autorun
**Code:** https://github.com/phyllicai/makan-kaki (MIT)

## Inspiration
In Malaysia, badminton doesn't end at the last rally. It ends at the mamak. Every week our group stands outside the court, sweaty and starving, having the same negotiation:
- one kaki needs halal;
- one is vegetarian;
- one wants char kway teow, another wants a burger;
- and the place has to still be open after we've showered and driven over.

We usually give up and go to the same 24-hour mamak again.

A general chatbot gives you "popular restaurants nearby". It knows nothing about *these four people*, and it will happily send a halal-eating friend to a bak kut teh shop. Qloo's taste graph can predict what a specific person will like from what they already love. So we built an agent that treats group dining as a taste problem with hard safety rules, not a search problem.

## What it does
- **Input:** the court area, day, game end time, distance and budget. For each player: cravings ("nasi lemak, teh tarik"), places they love, and dietary needs (halal, vegetarian, no pork, no beef).
- **Taste signals:** the agent turns each player's taste into Qloo signals. Cravings become place tags (`/v2/tags`), and loved places become Qloo place entities (`/search`).
- **Group candidates:** it asks Qloo Insights for places near the court that fit the **whole group's** taste, filtered by opening day and price. If someone needs halal, it makes a second pull filtered to Qloo's halal tags.
- **Per-player scores:** it asks Qloo **once per player** to score every candidate, so it knows how much Aina vs. Wei Jie vs. Priya would like each spot.
- **Diet guard:** every venue is checked against Qloo's own tags, keywords and specialty dishes.
  - Pork evidence fails halal and no-pork. That covers English, Malay and Chinese terms: pork, bak kut teh, char siu, siew yoke, lard, babi, 猪, 肉骨茶, and more.
  - A bar, pub or brewery fails halal.
  - **Negative evidence beats a positive tag.** A place tagged halal that also lists "pork ribs noodles" is ruled out.
  - Places with no pork evidence but no halal tag are **held back**, not silently passed.
- **Ranking:** a fairness blend of average happiness plus "least misery", so nobody gets sacrificed. There's a bonus for verified constraints and for being close (tired legs).
- **Reflection:** if fewer than three spots fit everyone, it widens the radius, then the budget, and searches again.
- **Output:**
  - the top picks, with per-player match bars and a mini map;
  - what got ruled out, with evidence (e.g. "not halal: pork on menu (Pork ribs noodles)");
  - what was held back;
  - a full agent trace of every Qloo call and decision.

## How we built it
- **Agent:** a plan → act → observe → reflect → explain loop (`src/agent/agent.js`) that uses Qloo endpoints as its tools.
  - The controller is deterministic, so results are reproducible and judgeable.
  - An optional LLM (any OpenAI-compatible endpoint) can parse free-text notes and write a one-line pitch strictly from a verified-facts JSON. The hosted demo runs without one.
- **Qloo calls:** `GET /v2/tags`, `GET /search` and `GET /v2/insights` on the hackathon API, with:
  - `filter.type=urn:entity:place`, `filter.location` (WKT point) and `filter.location.radius`;
  - `signal.interests.tags` and `signal.interests.entities`;
  - `filter.tags` with `operator.filter.tags=union` (the halal pull);
  - `filter.results.entities` (per-player scoring, chunked to Qloo's 50-result limit);
  - `filter.hours`, `filter.price_level.max` and `feature.explainability`.
  - A typical plan makes 18–66 Qloo calls.
- **Diet guard:** `src/diet/rules.js` is a pure, unit-tested function. It turns Qloo tag IDs, tag names, keywords, descriptions and specialty dishes into halal, pork-free, no-beef and vegetarian verdicts, each with evidence.
- **Scoring:** pure, tested functions (`src/agent/scoring.js`) for constraints, past-midnight opening hours and the fairness score.
- **App:** a zero-dependency Node server with a vanilla JS/CSS front end and a per-IP rate limit. It's hosted on Railway in live Qloo mode.
- **Tests:** 20 `node --test` tests cover:
  - scoring and the diet rules (English, Malay and CJK pork terms, negations like "pork-free" or "beef bacon", bars, alcohol);
  - reflect-and-widen;
  - the LLM fallback;
  - the exact live request format;
  - a fake-API end-to-end run that proves a halal group never gets a pork place.

## Challenges we ran into
- **Real taste data is noisy about diet.** On live Qloo data, our first halal group got a bak kut teh place ranked #1. Qloo also tags some places halal while listing pork bone soup or beer. We built the diet guard on Qloo's own evidence, and made negative evidence override positive tags.
- **Silent API limits.** Per-player scores all came back as 0 once the candidate list passed 50, because `take` is capped at 50 and the 400 error was swallowed. Chunking candidate IDs fixed it, and scores now span roughly 0.6–0.9.
- **Group taste isn't an average.** A pure average picks the place three people love and one person hates. Scoring each player through Qloo and adding a least-misery term fixed that.
- **Time is a constraint too.** "Open" has to mean open at *arrival* (game end + 20 minutes), including places that close after midnight.
- **Malaysian food words.** "Malay" vs. "mala", "mee" vs. "mamak", and "Hamid" vs. "ham" all needed word-boundary parsing.

## Accomplishments that we're proud of
- We verified the halal rule on live Qloo data in Kepong, SS2 and George Town: the halal group got **no pork places**. Rejected places included Restoran Bak Kut Teh Klang, Kheng Bak Kut Teh, a wine bar, and Korean BBQ.
- Every pick is explainable per player, and every rejection shows the Qloo evidence behind it.
- The agent visibly corrects itself when constraints are too tight, and it's honest when halal can't be confirmed.
- It works fully without an LLM. Qloo is the intelligence, not a garnish.

## What we learned
Cultural taste is the missing input for group decisions. Search engines know what's nearby and LLMs know what's generally popular. Only a taste graph knows what *these* people will enjoy. And for food in Malaysia, taste without trust is useless: the agent has to be conservative about dietary rules and show its evidence.

## What's next for Makan Kaki
- A WhatsApp / Telegram bot: everyone in the group chat taps their cravings, and the bot posts the pick.
- JAKIM halal-certification lookup to upgrade "verify" to "certified".
- Remember each player's history, so "we went there last week" lowers a venue's score.
- Other post-activity moments: futsal, hiking groups, office lunches, family dinners with grandparents' needs.

## Built with
qloo · node.js · javascript · html5 · css3 · railway · github

*Built with substantial AI coding assistance, then reviewed and tested by the author.*
