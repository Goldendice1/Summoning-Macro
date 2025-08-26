// Harrow 3x3 Spread Macro for FoundryVTT
// Creates a 3x3 spread, column by column, with user choice for the first three cards

const deckId = "HFP9UHuhAujce3DJ"; // Replace with your deck ID
const handId = "Jrcc9M5RPmnvwDwr"; // Replace with your hand ID
const spreadSize = 3; // 3x3 grid

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
            dialogContent += `<div><img src='${card.img}' style='max-width:80px;'><br><b>${card.name}</b><br><button data-idx='${idx}'>Pick</button></div>`;
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

for (let col = 0; col < spreadSize; col++) {
    for (let row = 0; row < spreadSize; row++) {
        let spreadIdx = col * spreadSize + row;
        if (spreadIdx < 3) {
            // For first three cards, let user pick one of two
            let drawn = await hand.draw(deck, 2);
            if (!drawn || drawn.length < 2) {
                ui.notifications.warn("Not enough cards to draw.");
                return;
            }
            let picked = await pickOne(drawn);
            spread[col][row] = picked;
            usedCardIds.add(picked.id);
            // Return the unpicked card to the deck
            let unpicked = drawn.find(c => c.id !== picked.id);
            await deck.returnCard(unpicked);
        } else {
            // For remaining cards, draw one
            let drawn = await hand.draw(deck, 1);
            if (!drawn || drawn.length < 1) {
                ui.notifications.warn("Not enough cards to draw.");
                return;
            }
            spread[col][row] = drawn[0];
            usedCardIds.add(drawn[0].id);
        }
    }
}

// Display the spread in chat
let html = `<h2>Harrow 3x3 Spread</h2><table style='border-collapse:collapse;'>`;
for (let row = 0; row < spreadSize; row++) {
    html += `<tr>`;
    for (let col = 0; col < spreadSize; col++) {
        let card = spread[col][row];
        html += `<td style='border:1px solid #888; padding:4px; text-align:center;'>`;
        if (card) {
            html += `<img src='${card.img}' style='max-width:80px;'><br><b>${card.name}</b>`;
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
