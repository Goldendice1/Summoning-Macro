// Resume Suspended Creature Macro for FoundryVTT PF1e
// Run from the summoner's sheet to restore a suspended creature.

const FLAG_NS = "world";
const FLAG_KEY = "suspendedCreature";

// 1. Get summoner actor
// This macro assumes it's run from an Actor Sheet or with a character selected
let summoner = game.user.character;
if (!summoner && actor) { // Check if 'actor' is available (e.g., run from sheet)
    summoner = actor;
}
if (!summoner) {
    ui.notifications.error("No summoner found. Please assign a character to your user or run this from the summoner's actor sheet.");
    return;
}

// *** Find the summoner's token on the current scene ***
let summonerToken = canvas.tokens.placeables.find(t => t.actor && t.actor.id === summoner.id);
if (!summonerToken) {
    ui.notifications.error(`Could not find the summoner's token (${summoner.name}) on the current scene.`);
    return;
}

// 2. Get suspended creature data
const suspendData = await summoner.getFlag(FLAG_NS, FLAG_KEY);
if (!suspendData) {
    ui.notifications.warn("No suspended creature found for this summoner.");
    return;
}

// 3. Restore token to scene and clean up actor name
const tokenData = duplicate(suspendData.tokenData);
const resumedActor = game.actors.get(suspendData.actorId);

// *** REMOVE (Suspended) Appellation from actor and token ***
if (resumedActor && resumedActor.name.endsWith(" (Suspended)")) {
    const newName = resumedActor.name.replace(" (Suspended)", "").trim();
    
    // Update the Actor document itself (in the sidebar)
    await resumedActor.update({ "name": newName, "prototypeToken.name": newName });
    
    // ALSO update the token data we are about to create on the canvas
    tokenData.name = newName; 
}
// ---------------------------------------------------------

// *** Spawning at summoner's position (within 5ft/1 grid square) ***
const gridSize = canvas.scene.grid.size;
const offsets = [
    { x: 0, y: gridSize }, { x: gridSize, y: 0 },
    { x: 0, y: -gridSize }, { x: -gridSize, y: 0 },
    { x: gridSize, y: gridSize }, { x: -gridSize, y: gridSize },
    { x: gridSize, y: -gridSize }, { x: -gridSize, y: -gridSize },
];

let x = summonerToken.x;
let y = summonerToken.y;
let positionFound = false;

// Try to find an empty adjacent space
for (const offset of offsets) {
    const checkX = x + offset.x;
    const checkY = y + offset.y;
    // Check if the spot is already occupied
    const occupied = canvas.tokens.placeables.some(t => t.x === checkX && t.y === checkY);
    if (!occupied) {
        tokenData.x = checkX;
        tokenData.y = checkY;
        positionFound = true;
        break;
    }
}

// Fallback: If no adjacent space is free, spawn on the summoner
if (!positionFound) {
    tokenData.x = summonerToken.x;
    tokenData.y = summonerToken.y;
}
// ---------------------------------------------------------


// Ensure token uses the correct actor
tokenData.actorId = suspendData.actorId;
if (tokenData._id) delete tokenData._id; // Clean the ID

// Create the token and get the new document
const createdTokenDocs = await canvas.scene.createEmbeddedDocuments("Token", [tokenData]);
if (!createdTokenDocs || createdTokenDocs.length === 0) {
    ui.notifications.error("Failed to create token on scene.");
    return;
}
const firstTokenDoc = createdTokenDocs[0];


// === DURATION TRACKING (RESUMED) ===
let expirationData = {};
const EXPIRATION_FLAG_KEY = "summonExpirations"; 

if (game.combat) {
    // In combat: track round
    let combat = game.combat;
    let currentRound = combat.round;
    let duration = suspendData.remainingDuration; // in rounds
    
    // Expire at the start of the resumed creature's turn, 'duration' rounds later
    let expireRound = currentRound + duration;
    
    expirationData = {
        mode: "combat",
        actorId: resumedActor.id,
        tokenId: firstTokenDoc.id, // Use the new token ID
        expireRound,
        combatId: combat.id,
        created: Date.now()
    };
    let prevExpirations = await summoner.getFlag(FLAG_NS, EXPIRATION_FLAG_KEY) || [];
    prevExpirations.push(expirationData);
    await summoner.setFlag(FLAG_NS, EXPIRATION_FLAG_KEY, prevExpirations);
    
} else {
    // Out of combat: use Simple Calendar
    if (game.modules.get('foundryvtt-simple-calendar')?.active && window.SimpleCalendar?.api) {
        const scApi = window.SimpleCalendar.api;
        // 1 round = 6 seconds
        const seconds = suspendData.remainingDuration * 6;
        const nowTimestamp = scApi.timestamp();
        const expireTime = nowTimestamp + seconds;

        expirationData = {
            mode: "calendar",
            actorId: resumedActor.id,
            tokenId: firstTokenDoc.id, // Use the new token ID
            expireTime,
            created: Date.now()
        };
        let prevExpirations = await summoner.getFlag(FLAG_NS, EXPIRATION_FLAG_KEY) || [];
        prevExpirations.push(expirationData);
        await summoner.setFlag(FLAG_NS, EXPIRATION_FLAG_KEY, prevExpirations);
    }
}

// === ADD TO INITIATIVE (If in combat) ===
if (game.combat) {
    let summonerCombatant = game.combat.combatants.find(c => c.actorId === summoner.id);
    let initiative = 0;
    if (summonerCombatant) {
        initiative = summonerCombatant.initiative !== null ? summonerCombatant.initiative : 0;
    }
    
    let newSummonedCombatants = [];
    
    // Create the combatant for the new token
    let [newCombatant] = await game.combat.createEmbeddedDocuments("Combatant", [{
        tokenId: firstTokenDoc.id,
        actorId: firstTokenDoc.actorId
    }]);
    if (newCombatant) newSummonedCombatants.push(newCombatant);
    
    // Wait a tick to ensure combatants are updated
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // --- New initiative logic: place summons at summonerInitiative+0.01 ---
    let allCombatants = Array.from(game.combat.combatants);
    let summonerInit = initiative;
    let newInit = Number((summonerInit + 0.01).toFixed(2));
    
    // Set new summons to newInit
    for (let c of newSummonedCombatants) {
        await c.update({initiative: newInit});
    }
    
    // Find all other combatants (not new summons or summoner) at newInit
    let newSummonedIds = newSummonedCombatants.map(c => c.id);
    let summonerCombatantId = summonerCombatant?.id;
    
    let toBump = allCombatants.filter(c => 
        !newSummonedIds.includes(c.id) && 
        c.id !== summonerCombatantId && 
        c.initiative === newInit
    );
    
    // Chain bump upwards
    let bumpInit = newInit;
    const bumpedIds = new Set();
    while (toBump.length > 0) {
        bumpInit = Number((bumpInit + 0.01).toFixed(2));
        const updates = toBump.map(c => ({ _id: c.id, initiative: bumpInit }));
        await game.combat.updateEmbeddedDocuments("Combatant", updates);
        
        toBump.forEach(c => bumpedIds.add(c.id));
        
        // Re-fetch combatants and find the next group to bump
        allCombatants = Array.from(game.combat.combatants);
        toBump = allCombatants.filter(c => 
            !newSummonedIds.includes(c.id) && 
            c.id !== summonerCombatantId && 
            c.initiative === bumpInit && 
            !bumpedIds.has(c.id)
        );
    }
    
    await game.combat.setupTurns();
}


// === CHAT MESSAGE ===
// The name is now guaranteed to be the clean, resumed name
let actorName = resumedActor?.name || tokenData.name || "Summoned Creature";
let msg = `
<div class="pf1 chat-card">
    <header class="card-header flexrow">
        <h3 class="actor-name">Returning Summon!</h3>
    </header>
    <div class="result-text">
        <p><strong>${actorName}</strong> resummoned for <strong>${suspendData.remainingDuration}</strong> rounds.</p>
    </div>
</div>`;

ChatMessage.create({ content: msg });


// === HOOKS REGISTRATION (Required for duration deletion message) ===
// Only need to include the hooks if you don't have a separate macro for them.
// Since you asked for the full file, I will include the existing hook logic from your Summon Macro here.

// === HOOK: Check for expiration at each turn (Combat) ===
if (!window._summonExpirationHookId) {
    window._summonExpirationHookId = Hooks.on("updateCombat", async (combat, changed, options, userId) => {
        if (!("round" in changed || "turn" in changed)) return;
        for (let actor of game.actors.contents) {
            let expirations = actor.getFlag(FLAG_NS, "summonExpirations");
            if (!Array.isArray(expirations) || !expirations.length) continue;
            let changed = false;
            let actorExpirations = expirations.filter(exp => exp.mode === "combat" && exp.combatId === combat.id);
            if (!actorExpirations.length) continue;
            
            for (let exp of actorExpirations) {
                let {actorId, tokenId, expireRound} = exp;
                let tokens = canvas.tokens.placeables.filter(t => t.actor && t.actor.id === actorId && !t.actor.system?.conditions?.dead);
                let tokenIds = tokens.map(t => t.id);
                // *** Expiration Deletion Message Pop-up ***
                let buttonHtml = `<span class='summon-delete-placeholder' data-actor-id='${actorId}' data-summoner-id='${actor.id}'></span>`;
                
                if (tokenIds.length === 0) {
                    ChatMessage.create({content: `<div class=\"pf1 chat-card\"><header class=\"card-header flexrow\"><h3 class=\"actor-name\">Summon Expired (Defeated)</h3></header><div class=\"result-text\"><p>The summon duration has expired (all tokens defeated). ${buttonHtml}</p></div></div>`});
                    changed = true;
                }
                else if (combat.round >= expireRound && tokenIds.includes(combat.turns[combat.turn]?.tokenId)) {
                    ChatMessage.create({content: `<div class=\"pf1 chat-card\"><header class=\"card-header flexrow\"><h3 class=\"actor-name\">Summon Expired</h3></header><div class=\"result-text\"><p>The summon duration has expired. ${buttonHtml}</p></div></div>`});
                    changed = true;
                }
            }
            if (changed) {
                let newExpirations = expirations.filter(exp => {
                    if (exp.mode !== "combat" || exp.combatId !== combat.id) return true;
                    let {actorId, expireRound} = exp;
                    let tokens = canvas.tokens.placeables.filter(t => t.actor && t.actor.id === actorId && !t.actor.system?.conditions?.dead);
                    let tokenIds = tokens.map(t => t.id);
                    if (tokenIds.length === 0) return false;
                    if (combat.round >= expireRound && tokenIds.includes(combat.turns[combat.turn]?.tokenId)) return false;
                    return true;
                });
                await actor.setFlag(FLAG_NS, "summonExpirations", newExpirations);
            }
        }
    });
}

// === OUT-OF-COMBAT SUMMON EXPIRATION CHECK (Simple Calendar) ===
if (game.modules.get('foundryvtt-simple-calendar')?.active && window.SimpleCalendar?.api && window.SimpleCalendar?.Hooks?.DateTimeChange) {
    if (!window._summonCalendarExpirationHookId) {
        window._summonCalendarExpirationHookId = Hooks.on(window.SimpleCalendar.Hooks.DateTimeChange, async () => {
            const scApi = window.SimpleCalendar.api;
            for (let actor of game.actors.contents) {
                let expirations = actor.getFlag(FLAG_NS, "summonExpirations");
                if (!Array.isArray(expirations) || !expirations.length) continue;
                let changed = false;
                let calendarExpirations = expirations.filter(exp => exp.mode === "calendar");
                if (!calendarExpirations.length) continue;
                
                let now = scApi.timestamp();
                for (let exp of calendarExpirations) {
                    let { actorId, tokenId, expireTime } = exp;
                    let tokens = canvas.tokens.placeables.filter(t => t.actor && t.actor.id === actorId && !t.actor.system?.conditions?.dead);
                    let tokenIds = tokens.map(t => t.id);
                    // *** Expiration Deletion Message Pop-up ***
                    let buttonHtml = `<span class='summon-delete-placeholder' data-actor-id='${actorId}' data-summoner-id='${actor.id}'></span>`;
                    
                    if (tokenIds.length === 0 || now >= expireTime) {
                        let chatCard = `<div class=\"pf1 chat-card\"><header class=\"card-header flexrow\"><h3 class=\"actor-name\">Summon Expired</h3></header><div class=\"result-text\"><p>The summon duration has expired. ${buttonHtml}</p></div></div>`;
                        ChatMessage.create({ content: chatCard });
                        changed = true;
                    }
                }
                if (changed) {
                    let newExpirations = expirations.filter(exp => {
                        if (exp.mode !== "calendar") return true;
                        let { actorId, expireTime } = exp;
                        let now = scApi.timestamp();
                        let tokens = canvas.tokens.placeables.filter(t => t.actor && t.actor.id === actorId && !t.actor.system?.conditions?.dead);
                        let tokenIds = tokens.map(t => t.id);
                        if (tokenIds.length === 0 || now >= expireTime) return false;
                        return true;
                    });
                    await actor.setFlag(FLAG_NS, "summonExpirations", newExpirations);
                }
            }
        });
    }
}

// === DELETE SUMMON BUTTON HANDLER ===
if (!window._summonDeleteButtonHookId) {
    window._summonDeleteButtonHookId = Hooks.on("renderChatMessage", (message, html, data) => {
        html.find('span.summon-delete-placeholder').each(function() {
            const actorId = $(this).data('actor-id');
            const summonerId = $(this).data('summoner-id');
            const button = $(`<button type='button' style="font-size: 0.8em; padding: 2px 4px;"><i class='fas fa-trash'></i> Delete Summon</button>`);
            button.on('click', async function() {
                // Remove combatants
                if (game.combat) {
                    let toDelete = game.combat.combatants.filter(c => c.actorId === actorId);
                    if (toDelete.length > 0) {
                        let ids = toDelete.map(c => c.id);
                        await game.combat.deleteEmbeddedDocuments("Combatant", ids);
                    }
                }
                // Remove tokens
                const tokens = canvas.tokens.placeables.filter(t => t.actor && t.actor.id === actorId);
                for (let token of tokens) {
                    await token.document.delete();
                }
                // Remove the actor
                const summonedActor = game.actors.get(actorId);
                if (summonedActor) {
                    // Rename back before deleting, just in case (optional, but clean)
                    if (summonedActor.name.endsWith(" (Suspended)")) {
                        await summonedActor.update({ "name": summonedActor.name.replace(" (Suspended)", "").trim() });
                    }
                    await summonedActor.delete();
                }
                // Remove the expiration entry
                const summoner = game.actors.get(summonerId);
                if (summoner) {
                    let expirations = await summoner.getFlag(FLAG_NS, "summonExpirations") || [];
                    let newExpirations = expirations.filter(exp => exp.actorId !== actorId);
                    await summoner.setFlag(FLAG_NS, "summonExpirations", newExpirations);
                }
                if (game.combat) await game.combat.setupTurns();
                
                ChatMessage.create({content: `<div class=\"pf1 chat-card\"><header class=\"card-header flexrow\"><h3 class=\"actor-name\">Summon Deleted</h3></header><div class=\"result-text\"><p>The summon has been deleted.</p></div></div>`});
                $(this).closest('div.result-text').find('p').text('The summon has been deleted.');
            });
            $(this).replaceWith(button);
        });
    });
}

// === CLEAR FLAG ON SUMMONER (Success) ===
await summoner.unsetFlag(FLAG_NS, FLAG_KEY);