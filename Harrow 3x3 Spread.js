
(async () => {
// Harrow 3x3 Spread Macro for FoundryVTT
// Creates a 3x3 spread, column by column, with user choice for the first three cards
// Now prompts for alignment and highlights matches/opposites

const deckId = "HFP9UHuhAujce3DJ"; // Replace with your deck ID
const handId = "Jrcc9M5RPmnvwDwr"; // Replace with your hand ID
const spreadSize = 3; // 3x3 grid

// Alignment options
const alignments = [
    { code: "none", name: "No Alignment" },
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

// Opposite alignment map
const oppositeMap = {
    lg: "ce", cg: "le", le: "cg", ce: "lg",
    ln: "cn", cn: "ln",
    ng: "ne", ne: "ng"
};

// For neutral, allow user to pick which corner is opposite
const neutralOpposites = ["lg", "cg", "le", "ce"];

// Prompt for alignment
// ...existing code...
let chosenAlignment = null;
let chosenOpposite = null;
let chosenAlignmentText = null;
let chosenOppositeText = null;
await new Promise(resolve => {
    let options = alignments.map(a => `<option value='${a.code}'>${a.name}</option>`).join("");
    let content = `<label>Select your alignment: <select id='align-select'>${options}</select></label><div id='neutral-corner' style='margin-top:1em; display:none;'><label>If Neutral, choose which corner is treated as opposite:<br>`;
    content += neutralOpposites.map(c => `<input type='radio' name='neutral-corner' value='${c}'>${alignments.find(a => a.code === c).name}`).join(" ");
    content += `</label></div>`;
    let d = new Dialog({
        title: "Choose Alignment",
        content,
        buttons: {
            ok: {
                label: "OK",
                callback: html => {
                    let align = html.find("#align-select").val();
                    chosenAlignment = align;
                    if (align === "none") {
                        chosenAlignmentText = null;
                        chosenOppositeText = null;
                    } else {
                        chosenAlignmentText = alignments.find(a => a.code === align).name.toLowerCase();
                        if (align === "n") {
                            let corner = html.find("input[name='neutral-corner']:checked").val();
                            chosenOpposite = corner || "lg";
                            chosenOppositeText = alignments.find(a => a.code === chosenOpposite).name.toLowerCase();
                        } else {
                            chosenOpposite = oppositeMap[align];
                            chosenOppositeText = alignments.find(a => a.code === chosenOpposite).name.toLowerCase();
                        }
                    }
                    resolve();
                }
            }
        },
        render: html => {
            html.find("#align-select").change(ev => {
                if (ev.target.value === "n") {
                    html.find("#neutral-corner").show();
                } else {
                    html.find("#neutral-corner").hide();
                }
            });
        }
    });
    d.render(true);
});

const deck = game.cards.get(deckId);
const hand = game.cards.get(handId);
if (!deck || !hand) {
    ui.notifications.error("Deck or hand not found.");
    return;
}
await hand.recall();
await deck.shuffle();

// Helper to prompt user to pick one of two cards
async function pickOne(cards) {
    return new Promise(resolve => {
        let dialogContent = `<div style='display:flex; gap:1em;'>`;
        cards.forEach((card, idx) => {
            // Extract parenthetical part from description
            let desc = card.description || "";
            let match = desc.match(/\(([^)]+)\)/);
            let parenthetical = match ? `<span style='font-weight:bold;'>(<i>${match[1]}</i>)</span><br>` : "";
            let alignment = "";
            if (match) {
                let parts = match[1].split(",");
                alignment = parts[0].trim().toLowerCase();
            }
            let highlight = "";
            if (chosenAlignmentText && alignment) {
                if (alignment === chosenAlignmentText) {
                    highlight = "background-color:#b6fcb6;"; // green for match
                } else if (alignment === chosenOppositeText) {
                    highlight = "background-color:#fcb6b6;"; // red for opposite
                }
            }
            dialogContent += `<div style='${highlight} padding:4px; border-radius:6px;'><img src='${card.img}' style='max-width:80px;'><br><b>${card.name}</b><br>${parenthetical}<button data-idx='${idx}'>Pick</button></div>`;
        });
        dialogContent += `</div>`;
        let d = new Dialog({
            title: "Pick a Card",
            content: dialogContent,
            buttons: {},
            render: html => {
                html.find('button').click(ev => {
                    let idx = Number(ev.target.getAttribute('data-idx'));
                    d.close();
                    resolve(cards[idx]);
                });
            }
        });
        d.render(true);
    });
}

let spread = Array(spreadSize).fill().map(() => Array(spreadSize).fill(null));
let usedCardIds = new Set();

// Draw all 12 cards at once
let allDrawn = await hand.draw(deck, 12);
if (!allDrawn || allDrawn.length < 12) {
    ui.notifications.warn("Not enough cards to draw.");
    return;
}

// For the first three spread positions, prompt user to pick one of two from the drawn cards
let drawnIdx = 0;
for (let pickNum = 0; pickNum < 3; pickNum++) {
    let col = Math.floor(pickNum / spreadSize);
    let row = pickNum % spreadSize;
    let pickOptions = [allDrawn[drawnIdx], allDrawn[drawnIdx + 1]];
    let picked = await pickOne(pickOptions);
    spread[col][row] = picked;
    usedCardIds.add(picked.id);
    // Mark both as used, but only add picked to spread
    drawnIdx += 2;
}

// Fill the rest of the spread with the remaining drawn cards
for (let col = 0; col < spreadSize; col++) {
    for (let row = 0; row < spreadSize; row++) {
        let spreadIdx = col * spreadSize + row;
        if (spreadIdx < 3) continue; // Already filled by picks
        spread[col][row] = allDrawn[drawnIdx];
        usedCardIds.add(allDrawn[drawnIdx].id);
        drawnIdx++;
    }
}

// Display the spread in chat
// Tally suits by category
let suitTallies = {
    exact: {},
    opposite: {},
    other: {}
};
for (let col = 0; col < spreadSize; col++) {
    for (let row = 0; row < spreadSize; row++) {
        let card = spread[col][row];
        if (!card) continue;
        let desc = card.description || "";
        let match = desc.match(/\(([^)]+)\)/);
        let alignment = "";
        let suit = "";
        if (match) {
            let parts = match[1].split(",");
            alignment = parts[0].trim().toLowerCase();
            suit = parts.length > 1 ? parts[1].trim() : "";
        }
        if (!suit) continue;
        if (chosenAlignmentText && alignment === chosenAlignmentText) {
            suitTallies.exact[suit] = (suitTallies.exact[suit] || 0) + 1;
        } else if (chosenOppositeText && alignment === chosenOppositeText) {
            suitTallies.opposite[suit] = (suitTallies.opposite[suit] || 0) + 1;
        } else {
            suitTallies.other[suit] = (suitTallies.other[suit] || 0) + 1;
        }
    }
}

function suitSummaryBlock(title, tallyObj) {
    let entries = Object.entries(tallyObj);
    if (entries.length === 0) return "";
    // Sort by descending count
    entries.sort((a, b) => b[1] - a[1]);
    return `<div><strong>${title}:</strong> ` + entries.map(([suit, count]) => `${suit}: ${count}`).join(", ") + `</div>`;
}

let suitSummaryHtml = "";
if (!chosenAlignmentText) {
    // No alignment chosen: just show suitTallies.other as 'Suit Totals'
    if (Object.keys(suitTallies.other).length > 0) {
        suitSummaryHtml += suitSummaryBlock("Suit Totals", suitTallies.other);
    }
} else {
    if (Object.keys(suitTallies.exact).length > 0) {
        suitSummaryHtml += suitSummaryBlock("Exact Matches", suitTallies.exact);
    }
    if (Object.keys(suitTallies.opposite).length > 0) {
        suitSummaryHtml += suitSummaryBlock("Opposite Matches", suitTallies.opposite);
    }
    if (Object.keys(suitTallies.other).length > 0) {
        suitSummaryHtml += suitSummaryBlock("Non-Matches", suitTallies.other);
    }
}

let html = `<h2>Harrow 3x3 Spread</h2>`;
if (suitSummaryHtml) {
    html += `<div style='margin-bottom:1em;'>${suitSummaryHtml}</div>`;
}
html += `<table style='border-collapse:collapse;'>`;
for (let row = 0; row < spreadSize; row++) {
    html += `<tr>`;
    for (let col = 0; col < spreadSize; col++) {
        let card = spread[col][row];
        // Extract alignment from card description
        let desc = card ? (card.description || "") : "";
        let match = desc.match(/\(([^)]+)\)/);
        let alignment = "";
        if (match) {
            let parts = match[1].split(",");
            alignment = parts[0].trim().toLowerCase();
        }
        // Determine highlight color
        let highlight = "";
        if (chosenAlignmentText && card && alignment) {
            if (alignment === chosenAlignmentText) {
                highlight = "background-color:#b6fcb6;"; // green for match
            } else if (alignment === chosenOppositeText) {
                highlight = "background-color:#fcb6b6;"; // red for opposite
            }
        }
        html += `<td style='border:1px solid #888; padding:4px; text-align:center; vertical-align:top;${highlight}'>`;
        if (card) {
            let parenthetical = match ? `<span style='font-weight:bold;'>(<i>${match[1]}</i>)</span><br>` : "";
            html += `<div style='display:flex; flex-direction:column; align-items:center; justify-content:flex-start;'>`;
            html += `<img src='${card.img}' style='max-width:80px;'><br><b>${card.name}</b><br>${parenthetical}`;
            html += `</div>`;
        } else {
            html += `&nbsp;`;
        }
        html += `</td>`;
    }
    html += `</tr>`;
}
html += `</table>`;

ChatMessage.create({
    content: html,
    whisper: [],
});

})();
