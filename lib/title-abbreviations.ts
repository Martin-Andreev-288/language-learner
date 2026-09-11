// Abbreviations that end in a period and are normally followed by a
// capitalized word (Question 369).
//
// The splitter's core rule is "period + space + capital letter = a new
// sentence", which is right almost always and wrong for everything here:
// "Dr. Wagner" is one name, not the end of one sentence and the start of
// another. Each entry below is protected before the split runs, so the
// period inside it is never offered to that rule.
//
// Reviewed as title-abbreviations.md before being written here, the same
// way word-sections.md was reviewed before becoming lib/word-categories.ts.
//
// The test for belonging on this list is narrow, and worth stating because
// it excludes plenty of common abbreviations: it has to be something that
// *precedes* a capitalized word and essentially never ends a sentence.
// "etc." and "usw." are far more common than most of what's here and are
// deliberately absent — they end sentences all the time, and protecting
// them would glue a real sentence boundary shut.
//
// Case-sensitive, deliberately. Italian writes "il sig. Rossi" in lower
// case and German writes "Dr." in upper, so both forms are listed where
// both are real rather than matching loosely and catching neither
// carefully.

export const TITLE_ABBREVIATIONS: string[] = [
    // --- English -----------------------------------------------------
    // Personal titles, all of which precede a name.
    "Mr.",
    "Mrs.",
    "Ms.",
    "Dr.",
    "Prof.",
    "Rev.",
    "Capt.",
    "Gen.",
    "Sgt.",
    "Gov.",
    "Sen.",
    "Rep.",
    // Place-name prefixes, the same shape as a title: "St. Petersburg",
    // "Mt. Everest".
    //
    // "St." carries a known cost, kept deliberately: it is also Street, in
    // which case it can genuinely end a sentence ("...on Main St. The
    // house is blue."), and that sentence will now be joined to the next.
    // Saint-before-a-name is far more common in prose than an address is,
    // so the trade is worth making — but it is a trade, not a free win.
    "St.",
    "Mt.",
    // Sr. and Jr. are deliberately absent. In English they *follow* a name
    // ("John Smith Jr."), so they land exactly where a sentence really
    // does end — protecting them would merge sentences rather than save
    // names. The draft list had them, with examples that were quietly
    // Spanish usage rather than English.

    // --- German ------------------------------------------------------
    "Dr.",
    "Prof.",
    "Hr.",
    "Fr.",
    "Dipl.-Ing.",
    "Mag.",
    // German is the language that needs the next group most, and the
    // reason is grammatical rather than stylistic: German capitalizes
    // every noun. "z. B. Hunde sind..." puts a capital right after the
    // abbreviation as a matter of course, where the English equivalent
    // ("e.g. dogs are...") does not — which is why the review file's
    // reasoning for leaving these out was sound for English and wrong
    // here.
    "z.B.",
    "z. B.",
    "bzw.",
    "ca.",
    "ggf.",
    "inkl.",
    "bzgl.",
    "evtl.",
    "u.a.",
    "u. a.",
    // Followed by a number, which the splitter also treats as the start of
    // a sentence: "Nr. 5" breaks today.
    "Nr.",
    "Abb.",

    // --- French ------------------------------------------------------
    "M.",
    "Pr.",
    "Mgr.",
    // "Mme" and "Mlle" are absent on purpose: French writes them without a
    // period, so there is no period for the splitter to trip over. Listed
    // in the review file so the decision was visible rather than missing.

    // --- Italian -----------------------------------------------------
    "Sig.",
    "Sig.ra",
    "Sig.na",
    "Dott.",
    "Dott.ssa",
    "Ing.",
    // Italian keeps these lower case mid-sentence far more often than it
    // capitalizes them: "ho parlato con il dott. Ferrari".
    "sig.",
    "sig.ra",
    "sig.na",
    "dott.",
    "dott.ssa",
    "prof.",
    "ing.",

    // --- Bulgarian ---------------------------------------------------
    // The truncated forms, which genuinely take a final period.
    "проф.",
    "инж.",
    "акад.",
    // The hyphenated forms are normally written *without* a final period —
    // "г-н Петров", not "г-н. Петров" — so they never trip the splitter in
    // correct usage. The review file had them with periods, which was the
    // error its own warning predicted. The dotted forms are kept anyway:
    // people do write them, and protecting a string that never appears
    // costs nothing.
    "г-н.",
    "г-жа.",
    "г-ца.",
    "д-р.",
    // Address prefixes, the same shape as the English place-name ones:
    // "ул. Витоша", "бул. България", "гр. Пловдив".
    "ул.",
    "бул.",
    "гр.",
];
