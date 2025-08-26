const deckId = "HFP9UHuhAujce3DJ"; // Replace with your deck ID
const handId = "Jrcc9M5RPmnvwDwr"; // Replace with your hand ID

// Get the actor from the item macro context (Foundry v12/PF1e v11.8)
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

// Get alignment from actor (PF1e v11.8)
let casterAlignmentCode = actor.system?.details?.alignment || "";
// Map two-letter codes (lowercase or uppercase) to full alignment names
const alignmentMap = {
    lg: "lawful good",
    ng: "neutral good",
    cg: "chaotic good",
    ln: "lawful neutral",
    n:  "neutral",
    cn: "chaotic neutral",
    le: "lawful evil",
    ne: "neutral evil",
    ce: "chaotic evil"
};
let casterAlignment = alignmentMap[casterAlignmentCode.trim().toLowerCase()] || casterAlignmentCode;

// Use the feature's maximum charges as the harrower level
let harrowerLevel = 0;
if (typeof item !== "undefined" && item?.system?.uses?.max) {
    harrowerLevel = item.system.uses.max;
}

const cardsDrawn = 3; // Number of cards to draw

// Retrieve the deck and hand
const deck = game.cards.get(deckId);
const hand = game.cards.get(handId);

if (!deck) {
    ui.notifications.error(`Deck with ID ${deckId} not found.`);
    return;
}
if (!hand) {
    ui.notifications.error(`Hand with ID ${handId} not found.`);
    return;
}

// Recall all cards from the hand to the deck
await hand.recall(); // Recall all cards from the hand back to the deck

// Shuffle the deck
await deck.shuffle();
console.log(`Deck "${deck.name}" shuffled.`);

// Draw cards using the hand's draw function
const drawnCards = await hand.draw(deck, cardsDrawn);
if (!drawnCards || drawnCards.length === 0) {
    ui.notifications.warn("No cards were drawn.");
    return;
}

// Track suit counts
let suitCounts = {};
let combinedHtml = drawnCards.map(card => {
    // Extract only the bolded (parentheses) part of the description
    let bolded = "";
    let suit = "";
    let alignment = "";
    const desc = card.description || "";
    const match = desc.match(/\(([^)]+)\)/);
    if (match) {
        bolded = `<strong>(${match[1]})</strong>`;
        // Extract alignment and suit from inside parentheses
        const parts = match[1].split(",");
        alignment = parts[0].trim().toLowerCase();
        if (parts.length > 1) {
            suit = parts[1].trim();
        }
    }
    if (suit) {
        // If alignment matches casterAlignment, count suit twice
        if (alignment && alignment === casterAlignment.trim().toLowerCase()) {
            suitCounts[suit] = (suitCounts[suit] || 0) + 2;
        } else {
            suitCounts[suit] = (suitCounts[suit] || 0) + 1;
        }
    }
    const imgHtml = card.img ? `<img src="${card.img}" alt="${card.name}" style="max-width:80px; max-height:120px; margin-right:8px; vertical-align:middle;">` : "";
    return `<div style="margin-bottom: 0.5em; display:flex; align-items:center;">${imgHtml}<div><b>${card.name}</b><br>${bolded}</div></div>`;
}).join("");

// Build suit totals summary
let suitSummary = "";
if (Object.keys(suitCounts).length > 0) {
    suitSummary = `<div style="margin-bottom:1em;"><strong>Suit Totals:</strong> ` +
        Object.entries(suitCounts).map(([s, count]) => `${s}: ${count}`).join(", ") +
        `</div>`;
}

// If harrowerLevel > 1, add spell piercing bonus for Intelligence suits
if (harrowerLevel > 1 && suitCounts["Intelligence"] > 0) {
    suitSummary += `<div style="margin-bottom:1em; color: #2e86c1;"><strong>Tower of Intelligence:</strong> Caster gets +${suitCounts["Intelligence"]} bonus to spell piercing for this casting.</div>`;
}
// If harrowerLevel > 2, add damage bonus for Strength suits
if (harrowerLevel > 2 && suitCounts["Strength"] > 0) {
    suitSummary += `<div style="margin-bottom:1em; color: #c0392b;"><strong>Tower of Strength:</strong> Caster gets +${suitCounts["Strength"]} bonus to damage for each damage die for this casting.</div>`;
}
// If harrowerLevel > 3, add spell DC bonus for Charisma suits
if (harrowerLevel > 3 && suitCounts["Charisma"] > 0) {
    suitSummary += `<div style="margin-bottom:1em; color: #8e44ad;"><strong>Tower of Charisma:</strong> Spell DC increases by +${suitCounts["Charisma"]} for this casting.</div>`;
}
// If harrowerLevel > 6, add healing for Constitution suits
if (harrowerLevel > 6 && suitCounts["Constitution"] > 0) {
    suitSummary += `<div style="margin-bottom:1em; color: #229954;"><strong>Tower of Constitution:</strong> Caster heals [[${suitCounts["Constitution"]}d6]] damage.</div>`;
}
// If harrowerLevel > 7, add bonus for Dexterity suits
if (harrowerLevel > 7 && suitCounts["Dexterity"] > 0) {
    suitSummary += `<div style="margin-bottom:1em; color: #2874a6;"><strong>Tower of Dexterity:</strong> Caster gets +${suitCounts["Dexterity"]} bonus to reflex saves and AC until the beginning of their next turn.</div>`;
}
// If harrowerLevel > 8, add bonus for Wisdom suits
if (harrowerLevel > 8 && suitCounts["Wisdom"] > 0) {
    suitSummary += `<div style="margin-bottom:1em; color: #196f3d;"><strong>Tower of Wisdom:</strong> Spell gets +${suitCounts["Wisdom"]} bonus to caster level for this casting.</div>`;
}

// Send a single chat message with all cards
ChatMessage.create({
    content: `<div class="harrow-cards">
        <h2 style='margin-bottom:0.5em;'>Harrow Casting</h2>
        ${suitSummary}
        <details style='margin-bottom:1em;'>
            <summary style='font-weight:bold; cursor:pointer;'>Show Drawn Cards</summary>
            ${combinedHtml}
        </details>
    </div>`,
    whisper: [], // Add whisper targets if needed
});