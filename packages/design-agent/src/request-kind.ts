/**
 * What kind of work a Design request is, so each kind does only its own work:
 *
 * - `build`: a new site, page or app screen. The full pipeline.
 * - `redesign`: new design for pages that already exist. The full pipeline, every page reviewed.
 * - `change`: an animation, a component, a tweak to one section, a fix from a review. No brief,
 *   brand, page or asset phases: the change is made, then previewed, captured and reviewed.
 * - `review`: an audit or a critique. No phase writes a file: the pages are previewed, captured
 *   and reviewed, and the findings are the answer.
 *
 * The briefing turn also asks the model for the kind; this module is the second opinion that
 * needs no model, and decides when the two disagree (the lighter one wins, because a wrong
 * heavy build costs a whole run and a wrong light path costs one more message).
 */
export const DESIGN_REQUEST_KINDS = ['review', 'change', 'redesign', 'build'] as const
export type DesignRequestKind = (typeof DESIGN_REQUEST_KINDS)[number]

export interface RequestClassification {
  kind: DesignRequestKind
  /** `clear` when the words name the kind; `unclear` when no cue matched and a default was taken. */
  confidence: 'clear' | 'unclear'
}

/** Lighter first: the order decides a disagreement. */
const WEIGHT = { review: 0, change: 1, redesign: 2, build: 3 } satisfies Record<
  DesignRequestKind,
  number
>

export function isDesignRequestKind(value: unknown): value is DesignRequestKind {
  return typeof value === 'string' && (DESIGN_REQUEST_KINDS as readonly string[]).includes(value)
}

const REVIEW_CUES = new RegExp(
  [
    '\\b(?:review|audit|critique|critiquing|evaluate|assess|inspect|proofread|analy[sz]e|feedback on|look over|check (?:out )?(?:this|the|my))\\b',
    "\\bwhat(?:'s| is| are) wrong\\b",
    '\\b(?:revis(?:e|ar|a|em|ão|ao)|avali(?:e|ar|ação|acao)|analis(?:e|ar)|critic(?:a|ar)|audit(?:e|ar|oria)|confira|confere|opine|d[êe] uma olhada|o que (?:est[áa]|tem) (?:de )?errado)\\b',
    '\\b(?:rev[ií]s(?:a|ar|ion)|eval[úu]a|analiza|critica|qu[ée] est[áa] mal)\\b',
    '\\b(?:pr[üu]fe|bewerte|kritisiere)\\b',
  ].join('|'),
  'iu',
)

/** An explicit wish that nothing is changed. */
const NO_CHANGE_CUES = new RegExp(
  [
    "\\b(?:without|don'?t|do not|no need to)\\s+(?:chang|edit|touch|modif|alter)",
    '\\b(?:only|just)\\s+(?:review|audit|look|tell me)',
    '\\bsem\\s+(?:alterar|mudar|editar|mexer|modificar)',
    '\\bn[ãa]o\\s+(?:altere|mude|edite|mexa|modifique)',
    '\\bs[óo]\\s+(?:revis|avali|analis|me diga|me fale)',
    '\\bsin\\s+(?:cambiar|modificar|editar|tocar)',
  ].join('|'),
  'iu',
)

const CHANGE_CUES = new RegExp(
  [
    '\\b(?:add|animate|animation|hover|transition|tweak|fix|adjust|change|update|tune|polish|center|resize|replace|swap|rename|nudge|smooth|fade|slide|align|recolou?r|restyle|move)\\b',
    '\\b(?:acrescent\\w*|adicion\\w*|anim(?:e|ar|a[çc][ãa]o|a[çc]oes)|ajust\\w*|corrij\\w*|corrig\\w*|troqu\\w*|trocar|mud(?:e|ar|a)|alter(?:e|ar)|aument\\w*|diminu\\w*|alinh\\w*|centraliz\\w*|deix(?:e|ar|a)|coloqu\\w*|tire|remova|remover)\\b',
    '\\b(?:a[ñn]ad\\w*|ajusta\\w*|cambia\\w*|mejora\\w*|anima\\w*|quita\\w*|corrige\\w*)\\b',
    '\\b(?:hover|micro-?intera[çc][ãa]o|transi[çc][ãa]o)\\b',
  ].join('|'),
  'iu',
)

const REDESIGN_CUES = new RegExp(
  [
    '\\b(?:redesign|re-?design|rebuild|revamp|overhaul|from scratch|new look|modernize|rework|refresh)\\b',
    '\\b(?:refa[çc]a|refazer|redesenh\\w*|reformul\\w*|do zero|renov\\w*|modernize|modernizar|novo visual|nova cara)\\b',
    '\\b(?:rehaz\\w*|redise[ñn]\\w*|desde cero|renueva\\w*)\\b',
  ].join('|'),
  'iu',
)

const BUILD_VERBS = new RegExp(
  [
    '\\b(?:create|build|make|design|generate|draft|write|set up)\\b',
    '\\b(?:crie|criar|cria|fa[çc]a|fazer|monte|montar|desenhe|desenhar|gere|construa|elabore)\\b',
    '\\b(?:crea|crear|haz|hacer|dise[ñn]a)\\b',
  ].join('|'),
  'iu',
)
const SURFACES =
  /\b(?:sites?|websites?|webpages?|web pages?|pages?|landing(?: pages?)?|homepages?|portfolio|portf[óo]lio|one-?pager|p[áa]ginas?|telas?|screens?|app|apps|aplicativos?|dashboard|painel|loja|store|shop|interface|ui)\b/iu

/**
 * The kind a request's own words name. With no cue at all the answer is `unclear`, and the
 * default follows whether the folder already has a page: change it when it does, build when not.
 */
export function classifyDesignRequest(
  request: string,
  options: { hasProject: boolean },
): RequestClassification {
  const text = request.replace(/\s+/g, ' ').trim()
  const review = REVIEW_CUES.test(text)
  const noChange = NO_CHANGE_CUES.test(text)
  const change = CHANGE_CUES.test(text)
  const redesign = REDESIGN_CUES.test(text)
  const build = BUILD_VERBS.test(text) && SURFACES.test(text)

  // A review that says nothing is to be changed is a review whatever else it mentions.
  if (noChange && (review || !build)) return { kind: 'review', confidence: 'clear' }
  if (redesign) {
    return { kind: options.hasProject ? 'redesign' : 'build', confidence: 'clear' }
  }
  // "Review and fix" asks for the fix as well: it is a change.
  if (review && !change && !build) return { kind: 'review', confidence: 'clear' }
  if (change && !build) {
    return { kind: options.hasProject ? 'change' : 'build', confidence: 'clear' }
  }
  if (review && change)
    return { kind: options.hasProject ? 'change' : 'build', confidence: 'clear' }
  if (build) return { kind: 'build', confidence: 'clear' }
  return { kind: options.hasProject ? 'change' : 'build', confidence: 'unclear' }
}

export interface ResolvedRequestKind {
  kind: DesignRequestKind
  /** How the kind was reached, for the log and the chat. */
  source: 'agreed' | 'lighter_of_both' | 'model' | 'words' | 'default_light'
}

/**
 * The model's answer and the words' classification, reconciled. The lighter kind wins a
 * disagreement, except that a words-only guess with no cue (`unclear`) defers to the model.
 * A request that names a light kind for a folder with no page becomes a build (a change has
 * nothing to change); a review of an empty folder stays a review and says there is nothing.
 */
export function resolveRequestKind(
  words: RequestClassification,
  modelKind: DesignRequestKind | undefined,
  options: { hasProject: boolean },
): ResolvedRequestKind {
  let resolved: ResolvedRequestKind
  if (!modelKind) {
    resolved = {
      kind: words.kind,
      source: words.confidence === 'clear' ? 'words' : 'default_light',
    }
  } else if (modelKind === words.kind) {
    resolved = { kind: modelKind, source: 'agreed' }
  } else if (words.confidence === 'unclear') {
    resolved = { kind: modelKind, source: 'model' }
  } else {
    resolved = {
      kind: WEIGHT[modelKind] <= WEIGHT[words.kind] ? modelKind : words.kind,
      source: 'lighter_of_both',
    }
  }
  if (!options.hasProject && resolved.kind === 'change') resolved = { ...resolved, kind: 'build' }
  if (!options.hasProject && resolved.kind === 'redesign') resolved = { ...resolved, kind: 'build' }
  return resolved
}

/** Kinds that run no brief, brand, page or asset phase. */
export function isLightRequestKind(kind: DesignRequestKind): boolean {
  return kind === 'review' || kind === 'change'
}

const MOTION_CUES =
  /\b(?:animat\w*|anima[çc]\w*|hover|transition|transi[çc]\w*|motion|movimento|fade|slide|parallax|scroll|reveal|entrada|entrance|micro-?intera\w*|efeito|effect|bounce|spin|rotat\w*|girar|pulsar|pulse|wiggle|marquee|carrossel|carousel)\b/iu

/** Whether the request asks for something that moves, which one still image cannot prove. */
export function requestInvolvesMotion(request: string): boolean {
  return MOTION_CUES.test(request)
}
