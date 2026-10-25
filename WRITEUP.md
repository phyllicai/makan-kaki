# Makan Kaki: the post-game makan agent
*Agents, but with taste, for the 10:30pm "where do we makan?" argument.*

## Inspiration
In Malaysia, badminton doesn't end at the last rally. It ends at the mamak. Every week our group stands outside the court, sweaty and starving, doing the same negotiation. One kaki needs halal, one is vegetarian, one wants char kway teow, one wants a burger, and the place we pick has to still be open by the time we've showered and driven over. We usually give up and go to the same 24-hour mamak again.

When we asked a general chatbot, we got a list of "popular restaurants nearby". It knew nothing about *these four people*. Qloo's taste graph can predict what a specific person will like from what they already love, so we built an agent that treats group dining as a taste problem rather than a search problem.

## What it does
- You enter the court area, day, game end time, distance and budget, plus each player's cravings ("nasi lemak, teh tarik"), places they love, and dietary needs (halal / vegetarian / no pork).
- The agent turns each player's taste into Qloo signals: cravings become place tags (`/v2/tags`) and loved places become Qloo place entities (`/search`).
- It asks Qloo Insights for places near the court that fit the **whole group's** taste, filtered by opening day and price.
- It then asks Qloo **once per player** to score every candidate, so it knows how much Aina vs. Wei Jie vs. Priya would like each spot.
- It enforces hard constraints (halal implies pork-free, vegetarian options, open at arrival time). Where the data can't confirm a constraint, it says "verify" instead of guessing.
- It ranks with a fairness blend: average happiness plus "least misery", so nobody gets sacrificed, with a bonus for being close (tired legs).
- If fewer than three spots fit everyone, it reflects, widens the radius and then the budget, and searches again.
- It shows the top picks with per-player match bars, a mini map, what got ruled out and why, and a full agent trace of every Qloo call and decision.

## How we built it
- **Agent**: a plan → act → observe → reflect → explain loop (`src/agent/agent.js`), with Qloo endpoints as its tools. The controller is deterministic, so results are reproducible and judgeable. An optional LLM (any OpenAI-compatible endpoint) parses free-text notes and writes a one-line pitch strictly from a verified-facts JSON.
- **Qloo**: `GET /v2/tags`, `GET /search` and `GET /v2/insights` on the hackathon base URL with `filter.type=urn:entity:place`, `filter.location` (WKT point), `filter.location.radius`, `signal.interests.tags`, `signal.interests.entities`, `filter.results.entities` (per-player scoring), `filter.hours`, `filter.price_level.max` and `feature.explainability`.
- **Scoring**: pure, unit-tested functions (`src/agent/scoring.js`) for constraints, past-midnight opening hours, and the fairness score.
- **App**: a zero-dependency Node server plus a vanilla JS/CSS front end, so it's fast to host and easy to read. There's a per-IP rate limit to protect the API quota.
- **Tests**: `node --test` covers the scoring maths, the constraint logic, the reflect-and-widen behaviour, the LLM fallback, and the exact live request format (base URL, `X-Api-Key`, query params) via a fake fetch.

## Challenges we ran into
- **Group taste isn't an average.** A pure average picks the place three people love and one person hates. Scoring each player separately through Qloo and adding a least-misery term fixed that.
- **Dietary data is a trust problem.** Halal status matters, and taste data isn't a certification. We made unknowns explicit ("verify halal") instead of silently passing or failing a venue.
- **Time is a constraint too.** "Open" has to mean open at *arrival* (game end + 20 minutes), including places that close after midnight.
- **Malaysian food words.** "Malay" vs. "mala" and "mee" vs. "mamak" needed word-boundary parsing before mapping cravings to Qloo tags.

## Accomplishments that we're proud of
- Every pick is explainable per player, so you can see why the group should agree.
- The agent visibly corrects itself when constraints are too tight.
- It works fully without an LLM. Qloo is the intelligence, not a garnish.

## What we learned
Cultural taste is the missing input for group decisions. Search engines know what's nearby and LLMs know what's generally popular. Only a taste graph knows what *these* people will enjoy.

## What's next for Makan Kaki
- A WhatsApp / Telegram bot: everyone in the group chat taps their cravings, and the bot posts the pick.
- Remember each player's history, so "we went there last week" lowers a venue's score.
- Other post-activity moments: futsal, hiking groups, office lunches, family dinners with grandparents' needs.
- Booking or queue-time integration for big groups.

## Built with
Qloo Insights API · Node.js · vanilla JavaScript/CSS · optional OpenAI-compatible LLM

*This project was built with substantial AI coding assistance and reviewed and tested by the author.*
