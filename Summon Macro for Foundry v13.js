/**
 * Summon Macro for Foundry v13
 * * Portal Mod required for this macro to work.
 * * v13 Update Notes:
 * - Removed Simple Calendar dependency.
 * - Now uses core game.time.worldTime for all duration tracking.
 * - Updated hooks to standard v13 'updateWorldTime'.
 **/

const config = {
    packSource: ["summons-for-pf1e"], // list of package sources for summons actor folders
    packTemplateSource: "summons-for-pf1e.summon-templates", // list of package sources for summoning templates
    ignoreCompendiums: [""],
    destinationFolder: "Summons", // Folder to file summons in when imported.
    renameAugmented: true, // Appends "(Augmented)" to the token if augmented
    useUserLinkedActorOnly: true, // Change to false to allow users to use any selected token they own as the summoner
    enableAugmentSummoning: false,      // Show Augment Summoning checkbox
    enableExtendMetamagic: false,       // Show Extend Metamagic checkbox
    enableReachMetamagic: false,        // Show Reach Metamagic checkbox
    enableConjuredArmor: false,         // Show Conjured Armor checkbox
    enableHarrowedSummoning: false      // Show Harrowed Summoning section
};

// Build options for folders to summon from
let packOptions = `<option value=""></option>` + game.packs.filter(p => p.documentName === "Actor" && config.packSource.includes(p.metadata.packageName) && !config.ignoreCompendiums.includes(p.metadata.name) && p.visible).map(p => `<option value="${p.collection}">${p.title}</option>`);

let summonerActor;
let summonerToken;
let gNumSpawned = 0;
let gNeedSpawn = 100;
let createdMonster;
let range = 0;

console.log("Summon Macro started");

// Get actor and token info
if (game.user.isGM || !config.useUserLinkedActorOnly) {
    // GMs must have a token selected
    let selectedTokens = canvas.tokens.controlled;
    if (!selectedTokens.length) {
        ui.notifications.warn("No token chosen as summoner.");
    } else {
        summonerToken = selectedTokens[0];
        summonerActor = summonerToken.actor;
    }
}
else {
    // Non GMs must have a character and a token for that character on the map
    summonerActor = game.user.character;
    if (!summonerActor) {
        ui.notifications.warn("No token chosen as summoner.");
    } else {
        let ownedTokens = canvas.tokens.ownedTokens.filter(o => o.actor && o.actor.id === summonerActor.id);
        if (!ownedTokens.length) {
            ui.notifications.warn(`No token of summoner ${summonerActor.name} available.`);
        } else {
            summonerToken = ownedTokens[0];
        }
    }
}

if (summonerActor && summonerToken) {
    // Build list of spellbooks from actor's system.attributes.spells.spellbooks
    let spellbooks = summonerActor.system?.attributes?.spells?.spellbooks || {};
    let spellbookKeys = Object.keys(spellbooks);
    
    let schoolConCL = summonerActor.system?.attributes?.spells?.school?.con?.cl;
    let spellbookOptions = spellbookKeys
        .map(key => {
            if (typeof key !== 'string') return '';
            const value = spellbooks[key];
            if (!value?.inUse) return '';
            let className = (typeof value.class === 'string') ? value.class : (value.class && typeof value.class.name === 'string' ? value.class.name : undefined);
            if (!className) return '';
            
            let classNameCap = className.charAt(0).toUpperCase() + className.slice(1);
            let cl = (typeof value.cl?.total === 'number') ? value.cl.total : value.cl || 1;
            // Add conjuration CL bonus if present
            let conjBonus = (typeof schoolConCL === 'number' && schoolConCL > 0) ? schoolConCL : 0;
            let totalCL = cl + conjBonus;
            let bonusText = conjBonus ? ` (+${conjBonus} Conj)` : '';
            return `<option value="${String(key)}">${classNameCap} (CL ${totalCL}${bonusText})</option>`;
        })
        .filter(opt => typeof opt === 'string' && opt.length > 0)
        .join('');
    
    let ownerCheck = "";
    if (game.user.isGM && summonerActor.hasPlayerOwner) ownerCheck = `<div class="form-group"><label>Give Ownership to ${summonerActor.name}'s Owners:</label><input type="checkbox" id="ownerCheck"></div>`;
    
    // Build UI
    const form = `
        <form class="flexcol">
            <div class="form-group">
                <label>Summoner:</label>
                <p>${summonerActor.name}</p>
            </div>
            <div class="form-group">
                <label>Spellbook:</label>
                <select id="classSelect">${spellbookOptions}</select>
            </div>
            <div class="form-group">
                <label>CL Override:</label>
                <input type="number" id="clOverride" placeholder="CL (e.g. for scrolls)">
            </div>
            <div class="form-group">
                <label>Summon From:</label>
                <select id="sourceSelect">
                    ${packOptions}
                </select>
            </div>
            <div class="form-group">
                <label>Summon:</label>
                <select id="monsterSelect">
                </select>
            </div>
            <div class="form-group">
                <label>Template:</label>
                <select id="template">
                    <option value="Celestial">Celestial</option>
                    <option value="Fiendish">Fiendish</option>
                    <option value="Entropic">Entropic</option>
                    <option value="Resolute">Resolute</option>
                </select>
            </div>
            <div class="form-group">
                <label>Number to Summon:</label>
                <input type="text" id="summonCount" placeholder="e.g. 1, 1d4+1">
            </div>
            ${config.enableAugmentSummoning ? `
            <div class="form-group">
                <label>Augment Summoning:</label>
                <input type="checkbox" id="augmentCheck" checked>
            </div>` : ""}
            ${config.enableExtendMetamagic ? `
            <div class="form-group">
                <label>Extend (Metamagic):</label>
                <input type="checkbox" id="extendCheck">
            </div>` : ""}
            ${config.enableReachMetamagic ? `
            <div class="form-group">
                <label>Reach (Metamagic):</label>
                <input type="checkbox" id="reachCheck">
            </div>` : ""}
            ${config.enableConjuredArmor ? `
            <div class="form-group">
                <label>Conjured Armor:</label>
                <input type="checkbox" id="conjuredArmorCheck">
            </div>` : ""}
            ${config.enableHarrowedSummoning ? `
            <fieldset style="margin-top:1em; border:1px solid #888; border-radius:4px; padding:0.5em;">
                <legend style="font-weight:bold;">Harrowed Summoning</legend>
                <div class="form-group">
                    <label>Suit 1:</label>
                    <select id="harrow1">
                        <option value=""></option>
                        <option value="str">Hammers</option>
                        <option value="dex">Keys</option>
                        <option value="con">Shields</option>
                        <option value="int">Books</option>
                        <option value="wis">Stars</option>
                        <option value="cha">Crowns</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Suit 2:</label>
                    <select id="harrow2">
                        <option value=""></option>
                        <option value="str">Hammers</option>
                        <option value="dex">Keys</option>
                        <option value="con">Shields</option>
                        <option value="int">Books</option>
                        <option value="wis">Stars</option>
                        <option value="cha">Crowns</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Alignment Match:</label>
                    <select id="harrowMatch">
                        <option value=1></option>
                        <option value=2>Double Duration</option>
                        <option value=.5>Half Duration</option>
                    </select>
                </div>
            </fieldset>` : ""}
            ${ownerCheck}
        </form>
    `;
    
    // Display UI
    const dialog = new Dialog({
      title: "Summon Monster",
      content: form,
      buttons: {
        use: {
          icon: '<i class="fas fa-dice-d20"></i>',
          label: "Summon",
          callback: importMonster
        }
      },
      render: (htm) => {
        htm.find('#sourceSelect').change(populateMonster.bind(this, htm));
        function updateTemplateState() {
            const monsterSelect = htm.find("#monsterSelect");
            const templateSelect = htm.find("#template");
            const selectedOption = monsterSelect.find("option:selected");
            const selectedName = selectedOption.text() || "";
            if (!selectedName.trim().endsWith("*")) {
                templateSelect.prop("disabled", true).css("opacity", 0.5);
            } else {
                templateSelect.prop("disabled", false).css("opacity", 1);
            }
        }
        htm.find("#monsterSelect").change(updateTemplateState);
        updateTemplateState();
      },
    }).render(true);
}

/**
 * On change of source dropdown, populate summon options from the chosen folder
 **/
async function populateMonster(htm, event) {
    let selectedPack = event.target.value;
    let monsterSelect = htm.find("#monsterSelect")[0];
    let monsterOptions = "";
    if (selectedPack) {
        let monsterList = await game.packs.get(selectedPack).getIndex();
        monsterOptions = monsterList.contents.sort((a, b) => { return a.name > b.name ? 1 : -1; }).map(p => `<option value="${p._id}">${p.name}</option>`);
    }
    monsterSelect.innerHTML = monsterOptions;
    htm.find("#monsterSelect").off("change").on("change", function() {
        const templateSelect = htm.find("#template");
        const selectedOption = $(this).find("option:selected");
        const selectedName = selectedOption.text() || "";
        if (!selectedName.trim().endsWith("*")) {
            templateSelect.prop("disabled", true).css("opacity", 0.5);
        } else {
            templateSelect.prop("disabled", false).css("opacity", 1);
        }
    }).trigger("change");
}

/**
 * Imports the selected monster and handles logic
 **/
async function importMonster(html) {
    let selectedPack = html.find("#sourceSelect")[0].value;
    let selectedMonster = html.find("#monsterSelect")[0].value;
    
    // Destination Folder Logic
    let folderID = "";
    if (config.destinationFolder) {
        let summonFolder = game.folders.getName(config.destinationFolder);
        if (!summonFolder) {
            let folder = await Folder.create({name: config.destinationFolder, type: "Actor", parent: null});
            folderID = folder.id;
        }
        else {
            folderID = summonFolder.id;
        }
    }
    
    // Import Actor
    console.log("Importing Actor");
    let monsterEntity = await game.packs.get(selectedPack).getDocument(selectedMonster);
    createdMonster = await Actor.create(monsterEntity.toObject());
    createdMonster = game.actors.get(createdMonster.id);

    // Update Permissions
    let currentPermission = createdMonster.permission;
    let updatedPermission = currentPermission[game.userId] = 3;
    if (game.user.isGM && summonerActor.hasPlayerOwner) {
        let giveOwnerCheck = html.find('#ownerCheck').length > 0 && html.find('#ownerCheck')[0].checked;
        if (giveOwnerCheck) updatedPermission = summonerActor.permission;
    }
    await createdMonster.update({"folder": folderID, "permission": updatedPermission});
    
    // Roll Count
    let countFormula = html.find("#summonCount").val();
    let roll;
    let rollResult = 0;
    
    let testRoll = new Roll(countFormula);
    if (!Roll.validate(countFormula) || (await testRoll.evaluate({minimize: true}).total <= 0)) {
        ui.notifications.error(`${countFormula} not a valid roll formula. Defaulting to 1.`);
        countFormula = "1";
    }
    
    testRoll = new Roll(countFormula);
    roll = await testRoll.roll();
    rollResult = roll.total;
    gNeedSpawn = rollResult;
    
    // Caster Level & Metamagic
    let chosenKey = html.find("#classSelect").val();
    let spellbooks = summonerActor.system?.attributes?.spells?.spellbooks || {};
    let classCL = (spellbooks[chosenKey]?.cl?.total) || spellbooks[chosenKey]?.cl || 1;
    let conjBonus = 0;
    let schoolConCL = summonerActor.system?.attributes?.spells?.school?.con?.cl;
    if (typeof schoolConCL === 'number' && schoolConCL > 0) {
        conjBonus = schoolConCL;
    }
    let casterLevel = classCL + conjBonus;
    let clOverride = parseInt(html.find("#clOverride").val());

    if (!isNaN(clOverride)) {
        if (clOverride <= 0) ui.notifications.error(`${clOverride} not a valid caster level. Defaulting to spellbook CL.`);
        else casterLevel = clOverride;
    }
    
    // Buff Setups
    let buffData = null;
    if (html.find("#augmentCheck")[0] && html.find("#augmentCheck")[0].checked) {
        buffData = { type: "buff", name: "Augment Summoning", system: { buffType: "temp" } };
    }

    let buffDataH = null;
    if (html.find("#harrow1")[0] && html.find("#harrow1")[0].value !== "") {
        buffDataH = { type: "buff", name: "Harrowed Summoning", system: { buffType: "temp" } };
    }
    
    // Range
    if (html.find("#reachCheck")[0] && html.find("#reachCheck")[0].checked) range = (100 + (casterLevel * 10));
    else range = (25 + (Math.floor(casterLevel / 2) * 5));
    
    // Extend
    if (html.find("#extendCheck")[0] && html.find("#extendCheck")[0].checked) casterLevel *= 2;

    // Harrow Match
    if (html.find("#harrowMatch")[0])
        casterLevel = Math.floor(casterLevel * html.find("#harrowMatch")[0].value);

    // Apply Templates
    let templateSelect = html.find("#template");
    let templateName = templateSelect.prop("disabled") ? "" : templateSelect.val();
    if(templateName !== "") {
        let pack = game.packs.get(config.packTemplateSource);
        let template = null;
        let index = await pack.getIndex();
        let entry = index.find(e => e.name === templateName);
        if (entry) {
            template = await pack.getDocument(entry._id);
        }

        if (template) {
            await createdMonster.createEmbeddedDocuments("Item", [template]);
            let actorName = createdMonster.name + ', ' + templateName;
            await createdMonster.update({"name": actorName});
            await createdMonster.update({"token.name": actorName});

            // Handle resistances/DR logic (standard PF1e logic preserved)
            let eres = await createdMonster.system.traits.eres.value;
            let hd = await createdMonster.system.attributes.hd.total;
            let resNum = hd >= 11 ? 15 : (hd >= 5 ? 10 : 5);
            let drNum = hd >= 11 ? 10 : (hd >= 5 ? 5 : 0);
            
            const acidRes = ["Celestial", "Entropic", "Resolute"];
            const coldRes = ["Celestial", "Counterpoised", "Dark", "Fiendish", "Resolute"];
            const elecRes = ["Celestial", "Counterpoised", "Resolute"];
            const fireRes = ["Counterpoised", "Entropic", "Fiendish", "Resolute"];

            if (acidRes.includes(templateName)) eres.push({"amount": resNum, "types": ["acid"]});
            if (coldRes.includes(templateName)) eres.push({"amount": resNum, "types": ["cold"]});
            if (elecRes.includes(templateName)) eres.push({"amount": resNum, "types": ["electric"]});
            if (fireRes.includes(templateName)) eres.push({"amount": resNum, "types": ["fire"]});

            await createdMonster.update({"system.traits.eres.value": eres});

            if (hd >= 5){
                let ddr = createdMonster.system.traits.dr.value;
                const typeMap = new Map([["Celestial", "Evil"], ["Fiendish", "Good"], ["Resolute", "Chaos"], ["Entropic", "Law"]]);
                let drType = typeMap.get(templateName) || "-";
                ddr.push({"amount": drNum, "types": [drType]});
                await createdMonster.update({"system.traits.dr.value": ddr});
            }

        } else {
            ui.notifications.error(`Template ${templateName} not found.`);
        }
        createdMonster.update({"system.details.alignment": summonerActor.system.details.alignment});
    }

    // Prototype Token Disposition
    await createdMonster.update({"prototypeToken.disposition": summonerToken.document.disposition});
    
    // Apply Augment Buff
    if (buffData) {
        await createdMonster.createEmbeddedDocuments("Item", [buffData]);
        let buff = createdMonster.items.find(o => o.name === "Augment Summoning" && o.type === "buff");
        let changes = [
            {formula: "4", priority: 1, target: "ability", subTarget: "str", modifier: "enh"},
            {formula: "4", priority: 1, target: "ability", subTarget: "con", modifier: "enh"}
        ];
        await buff.update({"system.changes": changes, "system.hideFromToken": true, "system.active": true});
        let actorName = createdMonster.name + " (Augmented)";
        await createdMonster.update({"name": actorName});
        await createdMonster.update({"token.name": actorName});
    }

     // Apply Harrow Buff
     if (buffDataH) {
        await createdMonster.createEmbeddedDocuments("Item", [buffDataH]);
        let buff = createdMonster.items.find(o => o.name === "Harrowed Summoning" && o.type === "buff");
        let changes = [];
        if (html.find("#harrow1")[0].value == html.find("#harrow2")[0].value || html.find("#harrow2")[0].value == "") {
            changes.push({formula: "6", priority: 1, target: "ability", subTarget: html.find("#harrow1")[0].value, modifier: "enh"});
        }
        else {
            changes.push({formula: "4", priority: 1, target: "ability", subTarget: html.find("#harrow1")[0].value, modifier: "enh"});
            changes.push({formula: "4", priority: 1, target: "ability", subTarget: html.find("#harrow2")[0].value, modifier: "enh"});
        }
        await buff.update({"system.changes": changes, "system.hideFromToken": true, "system.active": true});
    }

    // Conjured Armor
    if (html.find("#conjuredArmorCheck")[0]?.checked) {
        let spellbooks = summonerActor.system?.attributes?.spells?.spellbooks || {};
        let psychicLevel = 0;
        for (let key in spellbooks) {
            let sb = spellbooks[key];
            let className = (typeof sb.class === 'string') ? sb.class : (sb.class && typeof sb.class.name === 'string' ? sb.class.name : undefined);
            if (className && className.toLowerCase().includes("psychic")) {
                psychicLevel = sb.cl?.total || sb.cl || 0;
                break;
            }
        }
        if (psychicLevel > 0) {
            let deflectionBonus = 2;
            if (psychicLevel >= 8) deflectionBonus += 1;
            if (psychicLevel >= 15) deflectionBonus += 1;
            let conjuredArmorBuff = {
                type: "buff",
                name: "Conjured Armor",
                img: "icons/magic/defensive/shield-barrier-glowing-blue.webp",
                system: {
                    buffType: "temp",
                    changes: [{ formula: `${deflectionBonus}`, priority: 1, target: "ac", type: "deflection" }],
                    hideFromToken: true,
                    active: true
                }
            };
            await createdMonster.createEmbeddedDocuments("Item", [conjuredArmorBuff]);
        }
    }

    // Portal Spawning
    console.log("Spawning summons");
    let firstSummonedToken = null;
    let spawnedTokenIds = [];
    while (gNumSpawned < gNeedSpawn) {
        ui.notifications.info(`Click spawn location for ${createdMonster.name} within ${range} ft of summoner (${gNumSpawned} of ${gNeedSpawn})`);
        let portal = new Portal();
        await portal.addCreature(createdMonster);
        portal.color("#9e17cf");
        portal.texture("icons/magic/symbols/runes-triangle-magenta.webp");
        portal.origin(summonerToken);
        portal.range(range);
        await portal.pick();
        const spawnedTokens = await portal.spawn();

        if (gNumSpawned === 0 && spawnedTokens && spawnedTokens.length > 0) {
            firstSummonedToken = spawnedTokens[0];
            spawnedTokenIds = spawnedTokens.map(t => t.id);
        } else if (gNumSpawned === 0 && canvas.tokens.placeables) {
            firstSummonedToken = canvas.tokens.placeables.find(t => t.actor && t.actor.id === createdMonster.id);
            if (firstSummonedToken) spawnedTokenIds.push(firstSummonedToken.id);
        }
        gNumSpawned++;
    }
    ui.notifications.info("Done spawning summons!");

    // === DURATION TRACKING (Core v13) ===
    let expirationData = {};
    if (game.combat && firstSummonedToken) {
        // Combat Mode
        let combat = game.combat;
        let currentRound = combat.round;
        let duration = casterLevel; // rounds
        let expireRound = currentRound + duration;
        expirationData = {
            mode: "combat",
            actorId: createdMonster.id,
            tokenId: firstSummonedToken.id,
            expireRound,
            combatId: combat.id,
            created: Date.now()
        };
        console.debug("[SummonMacro] Created combat expiration:", expirationData);
    } else if (firstSummonedToken) {
        // Out of Combat Mode - Uses Core World Time
        const seconds = casterLevel * 6;
        // game.time.worldTime provides the official world time in seconds
        const expireTime = game.time.worldTime + seconds;
        expirationData = {
            mode: "calendar",
            actorId: createdMonster.id,
            tokenId: firstSummonedToken.id,
            expireTime,
            created: Date.now()
        };
        console.debug("[SummonMacro] Created calendar expiration: worldTime", game.time.worldTime, "expireTime", expirationData.expireTime, "seconds", seconds);
    }
    
    // Save flags
    if (firstSummonedToken) {
        let prevExpirations = await summonerActor.getFlag("world", "summonExpirations") || [];
        prevExpirations.push(expirationData);
        await summonerActor.setFlag("world", "summonExpirations", prevExpirations);
    }

    // Initiative and Turn Handling (after all tokens are spawned)
    if (game.combat) {
        // Wait briefly for token documents to be fully registered in the canvas
        const waitForTokens = async (ids, timeout = 2000) => {
            const start = Date.now();
            while (Date.now() - start < timeout) {
                const foundAll = ids.length === 0 || ids.every(id => !!canvas.tokens.get(id));
                if (foundAll) return true;
                await new Promise(r => setTimeout(r, 100));
            }
            return false;
        };

        if (spawnedTokenIds.length) {
            const ok = await waitForTokens(spawnedTokenIds, 2500);
            if (!ok) console.warn("[SummonMacro] Some spawned tokens did not register in time:", spawnedTokenIds);
        }

        // Refresh token list to ensure all spawned tokens are present
        let tokens = canvas.tokens.placeables.filter(t => t.actor && t.actor.id === createdMonster.id);
        console.debug("[SummonMacro] Found", tokens.length, "tokens for combatant creation, spawnedTokenIds:", spawnedTokenIds);

        if (tokens.length === 0) {
            console.warn("[SummonMacro] No tokens found after spawn; skipping combat setup");
        } else {
            let summonerCombatant = game.combat.combatants.find(c => c.actorId === summonerActor.id);
            let initiative = summonerCombatant?.initiative !== null ? summonerCombatant.initiative : 0;

            let newSummonedCombatants = [];
            
            // Build combatant data from tokens. Use the summoned Actor id (`createdMonster.id`) as
            // the authoritative `actorId` because token.actor may be a transient/prototype actor
            // that does not yet have a stable id in some spawn workflows.
            // Include a token snapshot when creating combatants. PF1e's Combatant class
            // may prioritize actor resolution unless a token snapshot is present; providing
            // the token document data helps bind the combatant to the exact token.
            const combatantDataArray = tokens.map(token => ({
                tokenId: token.id,
                actorId: createdMonster.id,
                sceneId: canvas.scene?.id || null,
                token: token.document.toObject()
            }));

            console.debug("[SummonMacro] Adding", combatantDataArray.length, "combatants to combat");
            newSummonedCombatants = await game.combat.createEmbeddedDocuments("Combatant", combatantDataArray);
            console.debug("[SummonMacro] Created combatants:", newSummonedCombatants.map(c => ({id: c.id, tokenId: c.tokenId, actorId: c.actorId})));

            // PF1e or Foundry may still render combatants by actor; force per-token display
            // by updating each combatant's `name` to match the token's display name.
            for (let combatant of newSummonedCombatants) {
                const token = canvas.tokens.get(combatant.tokenId);
                if (token) {
                    try {
                        // Ensure the combatant explicitly references the token and actor,
                        // and set the display name to the token name. This helps PF1e
                        // treat the combatant as token-linked for targeting and turn
                        // association.
                        await combatant.update({
                            tokenId: token.id,
                            actorId: createdMonster.id,
                            sceneId: canvas.scene?.id || null,
                            name: token.name
                        });
                        console.debug("[SummonMacro] Ensured combatant", combatant.id, "-> token", token.id, "actor", createdMonster.id, "name", token.name);
                    } catch (err) {
                        console.warn("[SummonMacro] Failed to update combatant properties for", combatant.id, err);
                    }
                } else {
                    console.debug("[SummonMacro] Token not found for combatant", combatant.id, combatant.tokenId);
                }
            }

            if (newSummonedCombatants.length > 0) {
                await new Promise(resolve => setTimeout(resolve, 100));

                // Init sorting logic
                let newInit = Number((initiative + 0.01).toFixed(2));
                for (let c of newSummonedCombatants) {
                    await c.update({initiative: newInit});
                }

                // Bump conflicting initiatives
                let allCombatants = Array.from(game.combat.combatants);
                let newSummonedIds = newSummonedCombatants.map(c => c.id);
                let toBump = allCombatants.filter(c => !newSummonedIds.includes(c.id) && c.id !== summonerCombatant?.id && c.initiative === newInit);
                let bumpInit = newInit;
                const bumpedIds = new Set();
                while (toBump.length > 0) {
                    bumpInit = Number((bumpInit + 0.01).toFixed(2));
                    for (let c of toBump) {
                        if (!bumpedIds.has(c.id)) {
                            await c.update({initiative: bumpInit});
                            bumpedIds.add(c.id);
                        }
                    }
                    allCombatants = Array.from(game.combat.combatants);
                    toBump = allCombatants.filter(c => !newSummonedIds.includes(c.id) && c.id !== summonerCombatant?.id && c.initiative === bumpInit && !bumpedIds.has(c.id));
                }
                await game.combat.setupTurns();

                // After turns are setup, move the combat pointer to the first summoned combatant
                try {
                    if (newSummonedIds.length) {
                        const turnIndex = game.combat.turns.findIndex(t => newSummonedIds.includes(t.id));
                        if (turnIndex !== -1) {
                            await game.combat.update({turn: turnIndex});
                            console.debug("[SummonMacro] Set combat turn to summoned combatant at index", turnIndex);
                        }
                    }
                } catch (err) {
                    console.warn("[SummonMacro] Failed to set combat turn to summoned combatant:", err);
                }
            }
        }
    }

    // Create Chat Message
    let msg = `
    <div class="pf1 chat-card">
        <header class="card-header flexrow">
            <h3 class="actor-name">Summoning!</h3>
        </header>
        <div class="result-text">
            <p><a class="inline-roll inline-result" title="${roll.formula}" data-roll="${encodeURI(JSON.stringify(roll))}"><i class="fas fa-dice-d20"></i> ${roll.total}</a> ${createdMonster.name} summoned for ${casterLevel} rounds.</p>
        </div>
    </div>`;

    ChatMessage.create({ content: msg });
}

// === HOOK: Combat Expiration ===
if (!window._summonExpirationHookId) {
    window._summonExpirationHookId = Hooks.on("updateCombat", async (combat, changed, options, userId) => {
        // Defensive: sometimes Hooks may fire with a null/undefined combat (e.g. transient updates)
        if (!combat) {
            console.debug("[SummonMacro] updateCombat hook called with null combat - skipping");
            return;
        }
        if (!("round" in changed || "turn" in changed)) return;
        for (let actor of game.actors.contents) {
            let expirations = actor.getFlag("world", "summonExpirations");
            if (!Array.isArray(expirations) || !expirations.length) continue;
            let changedFlag = false;
            for (let exp of expirations) {
                if (exp.mode !== "combat" || exp.combatId !== combat.id) continue;
                let {actorId, expireRound} = exp;
                let tokens = canvas.tokens.placeables.filter(t => t.actor && t.actor.id === actorId && !t.actor.system?.conditions?.dead);
                let tokenIds = tokens.map(t => t.id);
                let buttonHtml = `<span class='summon-delete-placeholder' data-actor-id='${actorId}' data-summoner-id='${actor.id}'></span>`;
                
                if (tokenIds.length === 0) {
                    ChatMessage.create({content: `<div class=\"pf1 chat-card\"><header class=\"card-header flexrow\"><h3 class=\"actor-name\">Summon Expired</h3></header><div class=\"result-text\"><p>The summon duration has expired (all tokens defeated). ${buttonHtml}</p></div></div>`});
                    changedFlag = true;
                }
                else if (combat.round === expireRound && combat.turns[combat.turn] && tokenIds.includes(combat.turns[combat.turn].tokenId)) {
                    ChatMessage.create({content: `<div class=\"pf1 chat-card\"><header class=\"card-header flexrow\"><h3 class=\"actor-name\">Summon Expired</h3></header><div class=\"result-text\"><p>The summon duration has expired. ${buttonHtml}</p></div></div>`});
                    changedFlag = true;
                }
            }
            if (changedFlag) {
                let newExpirations = expirations.filter(exp => {
                    if (exp.mode !== "combat" || exp.combatId !== combat.id) return true;
                    let {actorId, expireRound} = exp;
                    let tokens = canvas.tokens.placeables.filter(t => t.actor && t.actor.id === actorId && !t.actor.system?.conditions?.dead);
                    let tokenIds = tokens.map(t => t.id);
                    if (tokenIds.length === 0) return false;
                    if (combat.round === expireRound && combat.turns[combat.turn] && tokenIds.includes(combat.turns[combat.turn].tokenId)) return false;
                    return true;
                });
                await actor.setFlag("world", "summonExpirations", newExpirations);
            }
        }
    });
}

// === OUT-OF-COMBAT EXPIRATION (Core v13 - updateWorldTime) ===
// Replaces Simple Calendar Hooks
if (!window._summonWorldTimeHookId) {
    window._summonWorldTimeHookId = Hooks.on("updateWorldTime", async (worldTime, dt) => {
        console.debug("[SummonMacro] updateWorldTime hook fired: worldTime=", worldTime, "dt=", dt);
        
        for (let actor of game.actors.contents) {
            let expirations = actor.getFlag("world", "summonExpirations");
            if (!Array.isArray(expirations) || !expirations.length) continue;
            
            console.debug(`[SummonMacro] Checking ${expirations.length} expirations for actor ${actor.name}`);
            let newExpirations = [];
            let messagePosted = false;
            
            for (let exp of expirations) {
                if (exp.mode !== "calendar") {
                    console.debug("[SummonMacro] Skipping non-calendar expiration:", exp.mode);
                    newExpirations.push(exp); // Keep non-calendar expirations as-is
                    continue;
                }
                let { actorId, expireTime, created } = exp;
                
                let tokens = canvas.tokens.placeables.filter(t => t.actor && t.actor.id === actorId && !t.actor.system?.conditions?.dead);
                let tokenIds = tokens.map(t => t.id);
                
                // Guard: skip if expiration was just created (in the last second)
                const nowMs = Date.now();
                const createdMs = created || 0;
                const ageMs = nowMs - createdMs;
                if (ageMs < 1000) {
                    console.debug("[SummonMacro] Skipping freshly-created expiration (age:", ageMs, "ms, actorId:", actorId, ")");
                    newExpirations.push(exp); // Keep fresh expirations
                    continue;
                }
                
                console.debug("[SummonMacro] Expiration check for", actorId, ": worldTime=", worldTime, "expireTime=", expireTime, "tokens=", tokenIds.length);
                
                // Check if current worldTime >= expireTime OR all tokens dead/gone
                if (tokenIds.length === 0 || worldTime >= expireTime) {
                    console.debug("[SummonMacro] EXPIRATION TRIGGERED: worldTime", worldTime, ">=", "expireTime", expireTime, "actorId", actorId);
                    // Only post ONE message per actor expiration
                    if (!messagePosted) {
                        let buttonHtml = `<span class='summon-delete-placeholder' data-actor-id='${actorId}' data-summoner-id='${actor.id}'></span>`;
                        let chatCard = `<div class=\"pf1 chat-card\"><header class=\"card-header flexrow\"><h3 class=\"actor-name\">Summon Expired</h3></header><div class=\"result-text\"><p>The summon duration has expired. ${buttonHtml}</p></div></div>`;
                        ChatMessage.create({ content: chatCard });
                        messagePosted = true;
                    }
                    // DO NOT add this expiration to newExpirations (effectively removing it)
                } else {
                    // Not expired yet, keep it
                    newExpirations.push(exp);
                }
            }
            
            // Only update the flag if we actually removed something
            if (newExpirations.length !== expirations.length) {
                await actor.setFlag("world", "summonExpirations", newExpirations);
            }
        }
    });
}

// === DELETE SUMMON BUTTON HANDLER ===
if (!window._summonDeleteButtonHookId) {
    window._summonDeleteButtonHookId = Hooks.on("renderChatMessage", (message, html, data) => {
        html.find('span.summon-delete-placeholder').each(function() {
            const actorId = $(this).data('actor-id');
            const summonerId = $(this).data('summoner-id');
            const button = $(`<button type='button'><i class='fas fa-trash'></i> Delete Summon</button>`);
            button.on('click', async function() {
                // Remove any combatants for this actor
                if (game.combat) {
                    let toDelete = game.combat.combatants.filter(c => c.actorId === actorId);
                    if (toDelete.length > 0) {
                        let ids = toDelete.map(c => c.id);
                        await game.combat.deleteEmbeddedDocuments("Combatant", ids);
                    }
                }

                // Delete tokens via the Scene API for robustness
                const tokens = canvas.tokens.placeables.filter(t => t.actor && t.actor.id === actorId);
                if (tokens.length) {
                    const tokenIds = tokens.map(t => t.document.id);
                    try {
                        await canvas.scene.deleteEmbeddedDocuments("Token", tokenIds);
                    } catch (err) {
                        // Fallback to deleting individually
                        for (let token of tokens) {
                            await token.document.delete();
                        }
                    }
                }

                // Delete the summoned Actor
                const summonedActor = game.actors.get(actorId);
                if (summonedActor) {
                    await summonedActor.delete();
                }

                // Remove expiration entries on the summoner
                const summoner = game.actors.get(summonerId);
                if (summoner) {
                    let expirations = await summoner.getFlag("world", "summonExpirations") || [];
                    let newExpirations = expirations.filter(exp => exp.actorId !== actorId);
                    await summoner.setFlag("world", "summonExpirations", newExpirations);
                }

                if (game.combat) {
                    await game.combat.setupTurns();
                }

                ChatMessage.create({content: `<div class="pf1 chat-card"><header class="card-header flexrow"><h3 class="actor-name">Summon Deleted</h3></header><div class="result-text"><p>The summon has been deleted.</p></div></div>`});
                $(this).remove();
            });
            $(this).replaceWith(button);
        });
    });
}

// === CONVERT COMBAT TO WORLD TIME ON COMBAT END ===
if (!window._summonCombatEndHookId) {
    window._summonCombatEndHookId = Hooks.on("deleteCombat", async (combat, options, userId) => {
        // No Simple Calendar check needed, we run this always
        const lastRound = combat.round || 0;
        console.log("[SummonMacro] Combat ended. Converting durations.");
        
        for (let actor of game.actors.contents) {
            let expirations = await actor.getFlag("world", "summonExpirations");
            if (!Array.isArray(expirations) || !expirations.length) continue;
            let updatedExpirations = [];
            
            for (let exp of expirations) {
                if (exp.mode === "combat" && exp.combatId === combat.id) {
                    let remainingRounds = exp.expireRound - lastRound;
                    if (remainingRounds > 0) {
                        // Calculate new expire time using core worldTime
                        const seconds = remainingRounds * 6;
                        const expireTime = game.time.worldTime + seconds;
                        
                        updatedExpirations.push({
                            mode: "calendar",
                            actorId: exp.actorId,
                            tokenId: exp.tokenId,
                            expireTime,
                            created: Date.now()
                        });
                    }
                } else {
                    updatedExpirations.push(exp);
                }
            }
            await actor.setFlag("world", "summonExpirations", updatedExpirations);
        }
    });
}