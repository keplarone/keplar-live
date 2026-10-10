/**
 * Prompt starters for the Create studio, one per kind of app people build. Each is a complete, specific brief (what it is,
 * who it is for, the screens and data it needs, one signature detail), so a click gives the planner enough to make
 * something distinctive instead of a generic template.
 */
import type { BlueprintKind } from "./blueprint";

export type Starter = { id: string; label: string; kind: BlueprintKind; prompt: string };

export const STARTERS: Starter[] = [
  { id: "social", label: "Social app", kind: "social", prompt: "A social app for film photographers: profiles with camera and film stock, posts with scans, likes, follows and comments, an explore grid by film stock, and a weekly darkroom challenge everyone can vote on." },
  { id: "ai", label: "AI tool", kind: "ai", prompt: "An AI assistant for freelancers that turns a messy client email into a clear project brief, generates a quote with line items, rewrites my replies in my own tone, and keeps a searchable history of every brief with the client and deadline." },
  { id: "store", label: "Online store", kind: "store", prompt: "An online store for a small ceramics studio: a shop grid by collection, product pages with glaze and size options, a cart and checkout, order history, and a 'kiln this week' section showing what is being fired." },
  { id: "game", label: "Game", kind: "game", prompt: "A browser puzzle game where you rotate pipes to connect water to plants: 20 handmade levels, undo, hints, a level select with stars, and a satisfying growing animation when a level is solved." },
  { id: "dashboard", label: "Dashboard", kind: "dashboard", prompt: "A dashboard for a two-person coffee roastery: roasts logged with origin, weight and roast curve notes, green-bean inventory with low-stock warnings, weekly revenue, and a roast calendar." },
  { id: "booking", label: "Booking", kind: "booking", prompt: "A booking app for a hair salon: services with prices and durations, stylists with their own hours, real time slots, booking and canceling, reminders, and an admin view to block slots and see the day." },
  { id: "marketplace", label: "Marketplace", kind: "marketplace", prompt: "A marketplace where neighbors lend and borrow tools: listings with photos and a deposit, requests and approvals, messages between people, ratings after each return, and a map-free 'near me' list by street." },
  { id: "learning", label: "Learning", kind: "learning", prompt: "A language app for learning Portuguese through 5-minute daily stories: tap any word for its meaning, save words to a deck, spaced-repetition review, and a streak calendar." },
  { id: "community", label: "Community", kind: "community", prompt: "A community board for a running club: threads by topic, weekly group runs as events with RSVPs, member profiles with personal bests, and a shared route library." },
  { id: "site", label: "Website", kind: "site", prompt: "A website for a natural wine bar in Lisbon: an evocative home page, a menu that changes weekly, upcoming tastings with sign-up, table reservations, and the story of the owners." },
  { id: "tool", label: "Productivity", kind: "tool", prompt: "A habit tracker for night-shift nurses: habits that follow a shift pattern instead of the calendar, a check-in that takes two taps, gentle streaks that forgive missed days, and a monthly view." },
];
