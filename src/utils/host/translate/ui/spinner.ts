import type { ParagraphDiagnosis } from "../paragraph-diagnosis"
import type { TranslationTextFormat } from "@/types/config/translate"
import { isTranslationCancelledError } from "@/utils/request/cancellation"
import { SPINNER_CLASS } from "../../../constants/dom-labels"
import { getContainingShadowRoot, getOwnerDocument } from "../../dom/node"
import { translateTextForPage } from "../translate-variants"
import {
  clearPageTranslationNodeFailed,
  decrementInFlightPageTranslation,
  incrementInFlightPageTranslation,
  reportPageTranslationNodeFailed,
  reportPageTranslationRequestFailed,
} from "../translation-session"
import { ensurePresetStyles } from "./style-injector"

/**
 * Concurrent spin-animation ceiling. Keeping it low (8) avoids painting a
 * screen full of spinning rings while preventing main-thread style recalc.
 */
export const MAX_ANIMATED_SPINNERS = 8

/**
 * Delay before a spinner becomes visible so fast responses (such as Microsoft
 * Translate completing in < 350ms) never flash loading rings on the page.
 */
const SPINNER_REVEAL_DELAY_MS = 350

const spinnerAnimations = new WeakMap<HTMLElement, Animation>()
const spinnerRevealTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>()
let activeSpinnerAnimationCount = 0

/**
 * Cancel the spinner's reveal timer and spin animation so detached elements
 * never leak or keep ticking.
 */
export function cancelSpinnerAnimation(spinner: HTMLElement): void {
  const revealTimer = spinnerRevealTimers.get(spinner)
  if (revealTimer !== undefined) {
    clearTimeout(revealTimer)
    spinnerRevealTimers.delete(spinner)
  }

  const animation = spinnerAnimations.get(spinner)
  if (animation) {
    spinnerAnimations.delete(spinner)
    activeSpinnerAnimationCount = Math.max(0, activeSpinnerAnimationCount - 1)
    animation.cancel()
    return
  }
  spinner.getAnimations?.().forEach((liveAnimation) => liveAnimation.cancel())
}

/**
 * Create a lightweight, low-interference spinner element without React/Shadow DOM overhead.
 */
export function createLightweightSpinner(ownerDoc: Document): HTMLElement {
  const spinner = ownerDoc.createElement("span")
  spinner.className = SPINNER_CLASS
  spinner.style.cssText = `
    display: inline-block !important;
    width: 6px !important;
    height: 6px !important;
    min-width: 6px !important;
    min-height: 6px !important;
    max-width: 6px !important;
    max-height: 6px !important;
    aspect-ratio: 1 / 1 !important;
    margin: 0 4px !important;
    padding: 0 !important;
    vertical-align: middle !important;
    border: 1.5px solid transparent !important;
    border-top: 1.5px solid var(--read-frog-muted-foreground) !important;
    border-radius: 50% !important;
    box-sizing: content-box !important;
    flex-shrink: 0 !important;
    flex-grow: 0 !important;
    align-self: center !important;
    opacity: 0 !important;
    transition: opacity 150ms ease !important;
  `

  const revealTimer = setTimeout(() => {
    spinnerRevealTimers.delete(spinner)
    if (spinner.isConnected) {
      spinner.style.setProperty("opacity", "0.75", "important")
    }
  }, SPINNER_REVEAL_DELAY_MS)
  spinnerRevealTimers.set(spinner, revealTimer)

  const prefersReducedMotion = ownerDoc.defaultView?.matchMedia
    ? ownerDoc.defaultView.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false
  if (
    !prefersReducedMotion &&
    spinner.animate &&
    activeSpinnerAnimationCount < MAX_ANIMATED_SPINNERS
  ) {
    const animation = spinner.animate(
      [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
      {
        duration: 600,
        iterations: Infinity,
        easing: "linear",
      },
    )
    spinnerAnimations.set(spinner, animation)
    activeSpinnerAnimationCount++
  } else {
    spinner.style.borderTopColor = "var(--read-frog-muted-foreground)"
  }

  return spinner
}

export function createSpinnerInside(translatedWrapperNode: HTMLElement): HTMLElement {
  const ownerDoc = getOwnerDocument(translatedWrapperNode)
  const root = getContainingShadowRoot(translatedWrapperNode) ?? ownerDoc
  ensurePresetStyles(root)
  const spinner = createLightweightSpinner(ownerDoc)
  translatedWrapperNode.appendChild(spinner)
  return spinner
}

export async function getTranslatedTextAndRemoveSpinner(
  nodes: ChildNode[],
  textContent: string,
  spinner: HTMLElement,
  _translatedWrapperNode: HTMLElement,
  isCurrent: () => boolean = () => true,
  textFormat: TranslationTextFormat = "plain",
  translateRequest: () => Promise<string> = () => translateTextForPage(textContent, textFormat),
  diagnosis?: ParagraphDiagnosis,
): Promise<string | undefined> {
  let translatedText: string | undefined
  let didCountInFlight = false

  try {
    if (!isCurrent()) return undefined
    incrementInFlightPageTranslation()
    didCountInFlight = true
    translatedText = await translateRequest()
    if (!isCurrent()) return undefined
    clearPageTranslationNodeFailed(nodes)
  } catch (error) {
    // User-cancelled sessions fail silently.
    if (isTranslationCancelledError(error)) return undefined
    if (!isCurrent()) return undefined
    diagnosis?.untranslated("error", { error })
    reportPageTranslationRequestFailed(error)
    // Never inject inline retry circles or red exclamation marks into the page DOM;
    // record the failed unit centrally so the extension popup can display status and retry.
    reportPageTranslationNodeFailed(nodes, error)
  } finally {
    if (didCountInFlight) {
      decrementInFlightPageTranslation()
    }
    cancelSpinnerAnimation(spinner)
    spinner.remove()
  }

  return translatedText
}
