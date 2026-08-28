// One place to name the syntax theme, so the shell blocks in `Install` and the
// Java in `GraphComposeConnection` cannot drift apart.
//
// Shiki ships with Astro and runs at build time: the highlighted markup is in
// the HTML, and the page loads no highlighter. `vitesse-dark` is the closest
// built-in to this site's palette — desaturated, teal-leaning, and dark enough
// that the theme's own background can be dropped for the card's.
export const CODE_THEME = 'vitesse-dark';
