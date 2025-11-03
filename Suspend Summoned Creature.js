// Suspend Summoned Creature Macro for FoundryVTT PF1e
// Select a summoned token, then run this macro. Stores suspension data on the summoner actor.

// CONFIG: Set the flag namespace/key
const FLAG_KEY = "suspendedCreature"; // now stores a single object
const FLAG_NS = "world";

// 1. Get selected token
const selected = canvas.tokens.controlled;
if (selected.length !== 1) {
    ui.notifications.error("Please select exactly one summoned creature's token to suspend.");
    return;
}
const token = selected[0];

// 2. Get summoner actor
let summonerId = token.document.getFlag(FLAG_NS, "summonerId");
let summoner = null;
if (summonerId) {
    summoner = game.actors.get(summonerId);
}
if (!summoner) {
    summoner = game.user.character;
}
if (!summoner) {
    ui.notifications.error("No summoner found. Please assign a character to your user or ensure the token has a summonerId flag.");
    return;
}

// 3. Get remaining duration (assume flag, fallback to prompt)
let duration = token.document.getFlag(FLAG_NS, "remainingDuration");
console.log("Token remainingDuration flag:", duration);

if (!duration) {
    let expirations = await summoner.getFlag(FLAG_NS, "summonExpirations") || [];
    console.log("Summoner summonExpirations:", expirations);
    let exp = expirations.find(e => e.actorId === token.actor.id);
    console.log("Expiration entry for actor:", exp);
    if (exp) {
        if (exp.mode === "combat" && game.combat) {
            // Get remaining rounds in combat
            duration = exp.expireRound - game.combat.round;
            console.log("Duration from combat expiration:", duration);
        } else if (exp.mode === "calendar" && window.SimpleCalendar?.api) {
            // Get remaining rounds from calendar time
            let now = window.SimpleCalendar.api.timestamp();
            let remainingMs = exp.expireTime - now;
            duration = Math.ceil(remainingMs / 6000); // 1 round = 6 seconds = 6000ms
            console.log("Duration from calendar expiration:", duration);
        }
    }
}
if (!duration || duration <= 0) {
    duration = await new Promise(resolve => {
        new Dialog({
            title: "Set Remaining Duration",
            content: `<p>Enter remaining duration (rounds):</p><input type='number' id='durationInput' style='width:100%'>`,
            buttons: {
                ok: {
                    label: "OK",
                    callback: html => resolve(Number(html.find('#durationInput').val()))
                }
            },
            default: "ok",
            close: () => resolve(null) // Handle closing the dialog
        }).render(true);
    });
    
    if (!duration || duration <= 0) {
        ui.notifications.warn("Suspension canceled or invalid duration entered.");
        return;
    }
}

// 4. Store suspension data on summoner actor
const originalActor = token.actor;
const allTokensForThisActor = canvas.tokens.placeables.filter(t => t.actor && t.actor.id === originalActor.id);

let actorIdToStore;
let tokenData = token.document.toObject();

if (allTokensForThisActor.length > 1) {
    //
    // === MULTI-TOKEN CASE: "Copy" Strategy (Original Intent) ===
    // This token has siblings. We MUST make a copy.
    // The original actor and its expiration flag are left ALONE for the sibling tokens.
    //
    console.log("Suspend: Multi-token detected. Creating a copy.");
    
    // Duplicate the actor for the suspended token
    let actorData = originalActor.toObject();
    
    // Deep merge all token.actorData overrides into the new actor data
    if (token.document.actorData) {
        const mergeDeep = (target, source) => {
            for (const key of Object.keys(source)) {
                if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                    if (!target[key] || typeof target[key] !== 'object') target[key] = {};
                    mergeDeep(target[key], source[key]);
                } else {
                    target[key] = source[key];
                }
            }
            return target;
        };
        actorData = mergeDeep(actorData, token.document.actorData);
    }
    
    actorData.name = `${originalActor.name} (Suspended)`;
    const suspendedActor = await Actor.create(actorData);
    
    actorIdToStore = suspendedActor.id;
    
} else {
    //
    // === SINGLE-TOKEN CASE: "Rename/Reuse" Strategy (Cleanup) ===
    // This is the last token for this actor. We can safely reuse it.
    // We MUST remove the expiration flag to prevent a false "Expired" message.
    //
    console.log("Suspend: Single-token detected. Reusing original actor.");
    
    // Remove the original expiration flag to stop false expiration messages
    let expirations = await summoner.getFlag(FLAG_NS, "summonExpirations") || [];
    let newExpirations = expirations.filter(exp => exp.actorId !== originalActor.id);
    await summoner.setFlag(FLAG_NS, "summonExpirations", newExpirations);

    // Rename the *original* actor in the sidebar
    await originalActor.update({ "name": `${originalActor.name} (Suspended)` });
    
    actorIdToStore = originalActor.id;
}

// 5. Store the suspension data
if (tokenData._id) delete tokenData._id;
tokenData.actorId = actorIdToStore; // Point to the correct actor (new copy or renamed original)

const suspendData = {
    actorId: actorIdToStore,
    tokenData,
    remainingDuration: duration, // This is in ROUNDS
    tokenId: token.document.id, // The ID of the token we are deleting
    suspendedAt: Date.now()
};
await summoner.setFlag(FLAG_NS, FLAG_KEY, suspendData);

// 6. Remove creature from combat tracker (if applicable) and delete token
if (game.combat) {
    const combatant = game.combat.combatants.find(c => c.tokenId === token.id);
    if (combatant) {
        await game.combat.deleteEmbeddedDocuments("Combatant", [combatant.id]);
        console.log("Removed suspended creature from combat.");
    }
}
await token.document.delete();

ui.notifications.info("Creature suspended. You can resume it later.");