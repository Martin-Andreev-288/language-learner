// The topic list a vocabulary word can be filed under.
//
// Revised in Question 316 from the flat 65 that Question 310 generated
// straight out of word-sections.md. The reasoning behind every change is
// written up in word-sections-proposal.md; the short version is that a
// personal working file isn't quite a taxonomy. Three bare parents were
// dropped where their own children already covered them (Animals, Plants,
// Sciences), one overlap was folded away, two names lost the notes about
// how the file was built, and two entries were added — a catch-all for
// animals, so it matches the pattern every other multi-child group has,
// and numbers, which had no home at all.
//
// Kept as a plain list in code rather than read from word-sections.md at
// runtime: that file is an untracked working document, and a feature that
// stops working when a scratch file moves is not a feature.
//
// Suggestions, not a fixed set. The field stores plain text, so a category
// invented for a word nothing here fits is exactly as valid as one of
// these — see Answer 314 on why an invented one is never folded back into
// this list automatically.
export const WORD_CATEGORIES: string[] = [
    "Religion, religious rituals, and religious terms",
    "Socializing, communication",
    "City, state, urban facilities",
    "Transport, conveyance",
    "Education, intellectual activities and expressions",
    "Temperament, character, reactions",
    "Emotions, feelings, states, moods",
    "Eating, dishes, foods",
    "Kitchen, kitchen utensils",
    "Body, body parts, and actions with or on the body",
    "Health, symptoms, diseases, treatment",
    "Professions, positions",
    "Work, office, activities at work or in the office",
    "Market, business, trade",
    "Home, furniture, household items",
    "Family, relatives, events",
    "Time, time of day",
    "Clothes and their properties",
    "Accessories, items",
    "Actions with or on clothes",
    "Types of animals",
    "Animal attributes",
    "Animal terms and actions",
    "Other animal-related words",
    "Fruits",
    "Vegetables",
    "Shrubs, grasses, herbs, and other plants",
    "Trees",
    "Flowers",
    "Other words related to plants",
    "Colors",
    "Shades and words related to colors",
    "Directions, movement, location, roads",
    "Nature, geography, weather",
    "Sea, water terms, vacation, leave",
    "Publishing, literature, media, writing, printing activities",
    "Art, cinema, television",
    "Music, musical attributes, musical terms",
    "Mathematics",
    "Chemistry",
    "Physics",
    "Biology",
    "History",
    "Other sciences",
    "Grammar, morphology",
    "Parts of speech, grammatical units",
    "Driving and automotive terms",
    "Sports and sporting terms",
    "Crimes, contraindicated and immoral actions",
    "Criminal proceedings, court",
    "Labor, tools for labor, agriculture",
    "Prepositions, conjunctions, pronouns, adverbs, and important words",
    "Common questions and greetings",
    "Geographical and political concepts",
    "Popular tourist places and cities",
    "Countries",
    "Nationalities",
    "Numbers, quantities, and measurements",
    "Modern technology and digital life",
    "Computing and hardware, digital security",
    "Digital communication, technical terms and actions",
    "Software and applications, user interface and experience, digital content and media",
    "Internet and connectivity, data and storage",
];
