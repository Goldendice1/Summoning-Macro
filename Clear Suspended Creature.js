// Clear Suspended Creature Macro
// Deletes the actor and flag for a creature that was suspended but will not be resumed.

const FLAG_NS = "world";
const FLAG_KEY = "suspendedCreature";

// 1. Get summoner actor
let summoner = game.user.character;
if (!summoner && actor) { // Check if 'actor' is available (e.g., run from sheet)
    summoner = actor;
}
if (!summoner) {
    ui.notifications.error("No summoner found. Please assign a character to your user or run this from the summoner's actor sheet.");
    return;
}

// 2. Get suspended creature data
const suspendData = await summoner.getFlag(FLAG_NS, FLAG_KEY);
if (!suspendData) {
    ui.notifications.warn("No suspended creature found to clear.");
    return;
}

// 3. Find and delete the suspended actor
const suspendedActor = game.actors.get(suspendData.actorId);
if (suspendedActor) {
    await suspendedActor.delete();
    ui.notifications.info(`Deleted suspended actor: ${suspendedActor.name}`);
} else {
    ui.notifications.warn(`Could not find suspended actor with ID: ${suspendData.actorId}`);
}

// 4. Clear the flag on the summoner
await summoner.unsetFlag(FLAG_NS, FLAG_KEY);

ChatMessage.create({
    content: `<div class="pf1 chat-card">
        <header class="card-header flexrow">
            <h3 class="actor-name">Suspension Cleared</h3>
        </header>
        <div class="result-text">
            <p>The suspended creature data has been cleared from ${summoner.name}.</p>
        </div>
    </div>`
});