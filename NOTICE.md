# Ownership and license

> **This is a plain-language statement of intent, not a drafted agreement.** It
> has not been reviewed by counsel. The same lawyer who reviews the checklist
> language and the independent-contractor framing should confirm or replace this
> before anyone relies on it. Where it says "JuiceWorks", the exact legal entity
> name still needs filling in.

There are two different kinds of thing in this repository, owned by two
different parties.

## What JuiceWorks owns

The tool itself, and everything built to make it work:

- the checklist web app (`docs/index.html`) and the dashboard
  (`docs/dashboard.html`) — markup, styling, and client code;
- the submission endpoint (`netlify/functions/submit-checklist.js`) and its
  configuration (`netlify.toml`, `.env.example`);
- the checklist data model and validation approach
  (`checklist-items.json`, the canonical-text matching, the record format);
- the test and tooling suite (`tools/`);
- this documentation.

© JuiceWorks. Proprietary. All rights reserved.

This is not open-source and is not published under an open licence. Nothing here
grants anyone outside the arrangement below the right to copy, redistribute,
resell, sublicense, or offer this tool as a product or service of their own.

## What Texas Choice Roofing owns

Everything that makes it *theirs* rather than a generic form:

- the "Texas Choice Roofing" name and word mark;
- the TCR logo (`docs/assets/tcr_logo.png`) and the source artwork it came from;
- the brand colours, and the purpose statement, mission, and Ridge Points from
  `TCR_Purpose_Statement_and_Values.pdf`;
- the substance of the safety, visibility, cleanliness, and crew-readiness
  requirements — these are TCR's operating standards, written down.

© Texas Choice Roofing. JuiceWorks claims no ownership of any of it, and uses it
here only to build TCR's own tool.

## The licence to Texas Choice Roofing

JuiceWorks grants Texas Choice Roofing a **perpetual, worldwide, royalty-free,
non-exclusive licence** to use, run, host, display, and modify this tool for
TCR's own business — including having its own staff or contractors operate and
change it. No fee, no expiry, and it does not depend on any continuing
relationship with JuiceWorks.

What that licence does not include is the right to sell, redistribute, or
license the tool onward to third parties as a product. TCR using it to run TCR
jobs: yes, freely and forever. TCR or anyone else packaging it up and selling it
to other roofing companies: that stays with JuiceWorks.

## Third-party components

The pages load the Fraunces and Spline Sans typefaces from Google Fonts; both
are under the SIL Open Font License. There are no other third-party
dependencies — the function uses only what Node provides.
