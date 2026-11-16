# Direction: the concept, the type, the structure and the words

What comes before the kit and runs beside it: what the design is about, the plan written before any code,
what to refuse, and how the words of an interface are chosen. The kit (`system.css`, the deals, the
checkers) fixes the page's discipline; this file gives the page its point of view. Adapted from the `frontend-design` skill of Anthropic's public skills repository
(Apache-2.0, commit 1780c5e), reworded and fitted to this skill's run; section 12 says which rule stands
where the two differ. See `NOTICE` and `LICENSE-APACHE-2.0` in this skill's folder.

Work as the design lead at a studio known for giving every client an identity nobody mistakes for
anyone else's. This client has already rejected cliché and templated proposals and pays for a point of
view: deliberate choices of palette, type and layout that belong to this brief, and an aesthetic risk
when it is justified. The kit decides how a page is built; you decide what it is about.

## 1. Ground the design in the subject

- If the brief does not say what the product or subject is, identify it before designing and confirm it
  with the client: propose one concrete subject, the audience and the design's primary job. Use what you
  already know of the client's preferences or context as a hint.
- The subject's industry, materials and vernacular are where distinctive choices come from: a toy for
  girls aged 8 to 11 and a dashboard for financial analysts look very different. Build with the brief's
  real content and subject throughout, not with stand-ins.

## 2. The plan: tokens, wireframes, alignment

Before code, write a compact plan beside the plan lines of `SKILL.md` step 3:

- **Colour:** the base palette as 4 to 6 named hex values: the dealt tokens and the client's own colour,
  named for what they are (`shopfront green`, `ink`, `paper`), not new colours.
- **Type:** the typefaces and the role of each (the dealt pairing, `layout-v4.md` section 5).
- **Layout:** a layout concept in one-sentence prose descriptions, and an ASCII wireframe of the hero and
  of the screen order, to ideate and compare two or three before choosing. Include the alignment: is the
  content left aligned, centre aligned or justified, and why that suits the subject.
- **Principles:** what makes this page unique: the one thing it is about and the one memorable element
  (section 10).

## 3. Review the plan against the brief

Before building, read the plan against the brief. If any part reads like the generic default you would
produce for any similar page, not like a choice made for this brief, revise it; to test it, work through a
similar prompt and see whether you arrive somewhere similar. Say what you changed and why, then build the
revised plan. Here the review runs after the deal (`SKILL.md` step 4): a dealt palette or pairing that is
wrong for the subject is dealt again or replaced by the client's own colours, never kept because the deal
returned it.

## 4. What generated pages share

AI-made design clusters around some traits. They are legitimate for some briefs, but they are defaults,
not choices, and they appear whatever the subject:

1. a warm cream ground (near `#F4F1EA`) with a high-contrast serif display and a terracotta or warm-clay
   accent (often near `#D97757`, the accent of Anthropic's own Claude interface, so on a user's brief it
   reads as a tell);
2. a near-black ground with a single bright acid-green or vermilion accent;
3. a broadsheet layout: hairline rules, zero radius, dense newspaper-like columns;
4. the SaaS-card kit: content chopped into identical rounded cards, one radius on everything whatever its
   place in the hierarchy, the same soft grey shadow (`rgba(0,0,0,.1)`) under each, gradient washes as
   decoration;
5. template chrome whatever the subject: a tracked-out all-caps eyebrow above every heading, meta strings
   joined with middle dots (`A · B · C`), labels built as `WORD — fragment` with a spaced em dash,
   tinted near-black (`#0B0B0B`, `#111`) standing in for black, a monospace face for small data labels, a
   typed `→` appended to link and button text.

Where the brief pins a visual direction down, follow it exactly, even when it asks for one of these looks.
Where it leaves an axis free, do not spend that freedom on one of these defaults; weigh what you are good at against the chance to learn.

## 5. The hero

The hero is seen first. Open with the most characteristic thing in the subject's world,
in the form that suits it best: a headline, an image, an animation, a live demo, an interactive moment.
Choose on purpose: a big number with a small label, supporting stats and a gradient accent is the default
treatment, so use it only when it is truly the best option. Here the choice is made by telling
the hero dealer what the brief really has (`SKILL.md` step 4, `--has`), and an animated or interactive
hero belongs to tech pages only (`motion.md`).

## 6. Type

- Type carries the page's personality. One family or two; if two, clearly distinct (the dealt pairing).
- Choose faces deliberately, not the families you would reach for on any other project. Set a clear type
  scale with intentional weights, widths and spacing, following the guidance of The Elements of Typographic
  Style where the kit sets no value (`layout-v4.md` section 5 does for pages; an app screen, a component or
  a scale you write yourself take the book's).
- When type is a headline or a visual element, make the treatment an active part of the design (the
  `word` and `editorial` heroes, the type moment, the large address of a place), not a neutral vehicle for
  the content.
- Lines under 80 characters by default; this skill's own limit is stricter, 62 (`system.md`). A serif body
  gets slightly more line height than a sans-serif body.
- Three typographic tells to avoid: accenting a single word or phrase of a headline (one word in italic,
  bold or another colour), all-caps labels, and unnecessary typographic labels above content. A label
  above content stays only when it carries information, such as the notice line of the hero (`layout-v4.md`
  section 3): a fact, a status, a date.

## 7. Structure is information

Outlines, borders, numbering, eyebrows, dividers and labels encode something about the content; they are
not decoration. Numbered markers (01 / 02 / 03) are right only when the content is a sequence, such as
steps or a timeline: check that it is before adding them. A divider, rule or label that says nothing the layout does not already say is cut. The kit
agrees: separation by ground or space, one hairline, sentence-case labels (`system.md`).

## 8. Motion the visitor did not ask for

Use motion that is not triggered by the visitor sparingly and deliberately, only to draw attention. One
orchestrated moment, a single sequence or a single reveal, lands better than scattered effects; a
fade-and-slide-up on every section and a hover transition on every card are the generic default and read
as AI-made. Motion that answers the visitor's action (opening, expanding, confirming) is welcome when it
shows what changed. Here: other kinds of page have no motion by themselves, a tech page has the one
load-once motion and the dealt moments (`motion.md`), and the hover layer is for linked things only.

## 9. Writing the code

Mind the specificity of your selectors: classes easily cancel each other out, most often a type-based
selector such as `.section` against an element-based one such as `.cta`, in the padding and margin between
sections. Give each of those spaces one owner, and write page CSS only where a reference says to.

## 10. Restraint and self-critique

- Spend your boldness in one place. Let one element be the memorable thing, keep everything around it
  quiet and disciplined, and cut any decoration that does not serve the brief. (The kit says the same in
  its own terms: one effect, one timed loop, one type moment, one object that never carries the page.)
- Build to a quality floor without announcing it: responsive down to a phone, visible keyboard focus,
  reduced motion respected, visually accessible, harmonious colour. Never trade them for the concept.
- Critique your own work as you build and review screenshots when you can: a picture is worth a thousand
  tokens (`SKILL.md` step 6 does it with the kit's scripts).
- Before leaving the house, look in the mirror and take one accessory off (Chanel): remove one thing.
- A human creative remembers what they tried and looks for something new. If you have a place to jot down
  what you tried (next to the deal histories in `.taste-skill/`), it helps the next pass.

## 11. Words in the interface

Page copy follows `copy.md`. The words inside an interface (buttons, labels, toasts, empty states, errors,
settings) follow this section; where both speak, the stricter `copy.md` wins.

- Words appear in a design to make it easier to understand and use. They are design content, not
  decoration: bring to them the minimalism you bring to spacing and colour. Before writing, ask what the
  design needs to say and how it is best said to help the person move through it.
- Write from the end user's side. Name things by what users understand, in simple language, not by how
  the system is built: a user manages notifications, not webhook config. Describe what something is or
  does in plain terms instead of selling it. Specific and legible to a new user beats clever.
- Active voice by default. A call to action says exactly what happens: "Save changes", not "Submit". An
  action keeps one name through the whole flow, so the button that says "Publish" produces a toast that
  says "Published". The vocabulary of an interface is the signposting of the product: cohesion and
  consistency are how people learn their way around.
- Treat failure and emptiness as moments for direction, not mood. An error says what went wrong and how to
  fix it, in the interface's voice, not a person's: errors do not apologise and are never vague. An empty
  screen is an invitation to act.
- Conversational tone: plain verbs, sentence case, no filler, matched to the brand and the audience. Let
  each written element do exactly one job.

## 12. Where the two sets of rules differ

The kit's rule stands (the checkers enforce it); the other is kept as far as it fits.

| Topic | Kit | Direction | Stands |
|---|---|---|---|
| How much to invent | colour, pairing and hero are dealt, never picked | opinionated choices, aesthetic risk | the deal, then the plan review (section 3); risk goes into the concept and the one memorable element |
| Who wins | the nine house rules win over the rest | the brief's words always win | the brief wins on the look it pins down; the house rules win on everything else |
| Cream ground | `--g-main` is warm off-white by default on a place | cream plus serif plus clay is a tell | the token stays; the accent comes from the client's own shopfront or product |
| Near-black | one near-black ink, never `#000`; `--g-dark` is `#111` to `#1a1a1a` | tinted near-black standing in for black is a tell | the tokens stay; it is the ink and one dark band, not the page's whole identity |
| Colour in a word | once a page at most, never on a place | never accent a single word or phrase | never: only the muted run-on clause (`system.md`, Type) |
| Arrow on buttons | the drawn `svg.m-arrow` where the dealt look shows one | a typed `→` is a tell | the drawn arrow, only where dealt; never a typed character |
| Middle dots | facts lines in some recipes (`2 guests · 18 m²`) | free-form dotted meta strings are a tell | the recipes' lines stay; no other dotted strings |
| Motion | none by itself outside tech; hover on linked things | one orchestrated moment | the kit; its tech load-once motion is the one moment |
| Label above content | the hero's notice line is allowed | unnecessary labels are a tell | allowed only when it carries a fact |
