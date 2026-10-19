# Gather design

Gather helps community organizers bring people together. Discovery helps visitors choose an event. The signature is a collection of typographic posters drawn from flyers and community noticeboards. Navigation stays familiar. This is specific to events; no decorative dashboard charts or unrelated statistics.

Tokens precede layout in globals.css. Light: canvas #f8f9fb, surface #ffffff, ink #202536, muted #626a7a, action #334bd8, success #176247. Dark: canvas #151821, surface #1e2330, ink #f3f4fa, muted #b4bdcd, action #b2bdff, success #8ce0b3. Contrast is computed by scripts/check-contrast.mjs. Posters have independent content palettes. System sans for body and controls; Arial Black for poster display. Scale: 13, 14, 16, 20, 26, 36, 60px, using rem units and responsive display type. Minimum 44px controls. No decorative motion.

Regular: [brand / Discover · Going · Hosting / Create event], [intro + poster collage], [search / category / city], [three-column events]. Compact: [brand / Create], [navigation], [intro], [search], [categories], [single-column events]. Native HTML dialogs contain focus and support Escape and visible dismissal. Creation drafts survive dismissal on this device.

HIG principles applied to web foundations (native Apple navigation requirements do not apply):

- accessibility.md › Vision: “Support larger text sizes.” Relative type, wrapping, labels, and zoom checks.
- accessibility.md › Mobility: “Offer sufficiently sized controls.” 44px targets and keyboard access.
- layout.md › Visual hierarchy: “Order content by relative importance.” Title and date precede registration.
- typography.md › Ensuring legibility: “In general, avoid light font weights.” Regular body and medium metadata.
- color.md › Best practices: “Avoid using the same color to mean different things.” Blue actions; labeled status.
- search-fields.md › Best practices: “If possible, start search immediately when a person types.” Immediate filters.
- entering-data.md › Best practices: “When possible, offer choices instead of requiring text entry.” Native selects and date inputs.
- modality.md › Best practices: “Always give people an obvious way to dismiss a modal view.” Named close and cancel buttons.
- writing.md › Best practices: “Be action oriented.” Actions name their result.

Five lenses: accessibility (contrast, scale, keyboard), conventions (native HTML controls), craft (poster collection, quiet shell), interaction (busy states, durable data, reversible RSVP), writing (clear empty states and errors). Nothing extra needs to be added to the visual hierarchy.
