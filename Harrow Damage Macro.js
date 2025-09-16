// Spirit Deck
// Draws harrower level cards and calculates damage based on alignment match
const chosenAlignment = "cg"; // Change to desired code: lg, ng, cg, ln, n, cn, le, ne, ce

const deckId = "HFP9UHuhAujce3DJ"; // Replace with your deck ID
const handId = "Jrcc9M5RPmnvwDwr"; // Replace with your hand ID

// Get actor and harrower level
let actor = null;
if (typeof item !== "undefined" && item?.actor) {
    actor = item.actor;
} else if (typeof actor !== "undefined" && actor) {
    actor = actor;
}
if (!actor) {
    ui.notifications.error("No actor found. Please run this macro from a character sheet feature.");
    return;
}
let harrowerLevel = 0;
if (typeof item !== "undefined" && item?.system?.uses?.max) {
    harrowerLevel = item.system.uses.max;
}
if (!harrowerLevel || harrowerLevel < 1) {
    ui.notifications.error("Harrower level not found or invalid.");
    return;
}


const alignments = [
    { code: "lg", name: "Lawful Good" },
    { code: "ng", name: "Neutral Good" },
    { code: "cg", name: "Chaotic Good" },
    { code: "ln", name: "Lawful Neutral" },
    { code: "n",  name: "Neutral" },
    { code: "cn", name: "Chaotic Neutral" },
    { code: "le", name: "Lawful Evil" },
    { code: "ne", name: "Neutral Evil" },
    { code: "ce", name: "Chaotic Evil" }
];
const oppositeMap = {
    lg: "ce", cg: "le", le: "cg", ce: "lg",
    ln: "cn", cn: "ln",
    ng: "ne", ne: "ng"
};
const neutralOpposites = ["lg", "cg", "le", "ce"];
let chosenOpposite = null;
let chosenAlignmentText = alignments.find(a => a.code === chosenAlignment).name.toLowerCase();
let chosenOppositeText = null;
if (chosenAlignment === "n") {
    chosenOpposite = "lg"; // Change to desired neutral opposite: lg, cg, le, ce
    chosenOppositeText = alignments.find(a => a.code === chosenOpposite).name.toLowerCase();
} else {
    chosenOpposite = oppositeMap[chosenAlignment];
    chosenOppositeText = alignments.find(a => a.code === chosenOpposite).name.toLowerCase();
}

const deck = game.cards.get(deckId);
const hand = game.cards.get(handId);
if (!deck || !hand) {
    ui.notifications.error("Deck or hand not found.");
    return;
}
await hand.recall();
await deck.shuffle();

// Draw cards
const drawnCards = await hand.draw(deck, harrowerLevel);
if (!drawnCards || drawnCards.length === 0) {
    ui.notifications.warn("No cards were drawn.");
    return;
}

// Damage tallies
let damage = 0;
let exact = 0, partial = 0, opposite = 0, nonmatch = 0;
// ...existing code...
let cardHtmlInner = "";
drawnCards.forEach(card => {
    let desc = card.description || "";
    let match = desc.match(/\(([^)]+)\)/);
    let alignment = "";
    if (match) {
        let parts = match[1].split(",");
        alignment = parts[0].trim().toLowerCase();
    }
    let points = 1; // default non-match
    let matchType = "Non-Match";
    if (alignment === chosenAlignmentText) {
        points = 5;
        matchType = "Exact Match";
        exact++;
    } else if (alignment === chosenOppositeText) {
        points = 0;
        matchType = "Opposite Match";
        opposite++;
    } else {
        function getAxes(alignmentStr) {
            alignmentStr = alignmentStr.toLowerCase();
            let lawChaos = "neutral";
            let goodEvil = "neutral";
            if (alignmentStr.includes("lawful")) lawChaos = "lawful";
            else if (alignmentStr.includes("chaotic")) lawChaos = "chaotic";
            if (alignmentStr.includes("good")) goodEvil = "good";
            else if (alignmentStr.includes("evil")) goodEvil = "evil";
            return { lawChaos, goodEvil };
        }
        let chosenAxes = getAxes(chosenAlignmentText);
        let cardAxes = getAxes(alignment);
        let axisMatch = false;
        if (
            (chosenAxes.lawChaos === cardAxes.lawChaos && chosenAxes.lawChaos !== "neutral") ||
            (chosenAxes.goodEvil === cardAxes.goodEvil && chosenAxes.goodEvil !== "neutral")
        ) {
            axisMatch = true;
        }
        if (axisMatch) {
            points = 3;
            matchType = "Partial Match";
            partial++;
        } else {
            points = 1;
            matchType = "Non-Match";
            nonmatch++;
        }
    }
    damage += points;
    const alignmentTextToCode = {
        "lawful good": "LG",
        "neutral good": "NG",
        "chaotic good": "CG",
        "lawful neutral": "LN",
        "neutral": "N",
        "chaotic neutral": "CN",
        "lawful evil": "LE",
        "neutral evil": "NE",
        "chaotic evil": "CE"
    };
    let alignCode = alignmentTextToCode[alignment] || alignment;
    cardHtmlInner += `<div style='margin-bottom:0.5em;'><img src='${card.img}' style='max-width:40px; vertical-align:middle; margin-right:7px;'><b>${card.name}</b> <span style='font-weight:bold; font-size:0.9em;'>[${alignCode}] ${matchType}</span></div>`;
});
let cardHtml = `<details style='margin-bottom:1em;'><summary style='font-weight:bold; cursor:pointer;'>Show Drawn Cards</summary>${cardHtmlInner}</details>`;

// Build damage formula string
let formulaParts = [];
if (exact > 0) formulaParts.push(`${exact}*5`);
if (partial > 0) formulaParts.push(`${partial}*3`);
if (nonmatch > 0) formulaParts.push(`${nonmatch}*1`);
// Opposite matches do 0 damage, so not included
let damageFormula = formulaParts.join("+") || "0";
// Create damage card using AutomateDamage module
if (typeof AutomateDamage !== "undefined" && AutomateDamage?.roll) {
    await AutomateDamage.roll({
        formula: damageFormula,
        damageTypes: ["force"]
    });
}
let summaryHtml = "";
summaryHtml += `<div>Exact Matches: ${exact} &times; 5 pts</div>`;
summaryHtml += `<div>Partial Matches: ${partial} &times; 3 pts</div>`;
summaryHtml += `<div>Non-Matches: ${nonmatch} &times; 1 pt</div>`;
summaryHtml += `<div>Opposite Matches: ${opposite} &times; 0 pts</div>`;

ChatMessage.create({
    content: `<h2>Harrow Damage Macro</h2>${summaryHtml}<hr>${cardHtml}`,
    whisper: [],
});