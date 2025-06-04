/**
 * Portal Mod required for this macro to work
 * 
 * Allows any user with permission to create new actors to import one from a compendium
 * If that user also has permission to create tokens, will create the specified amount and 
 * spawn them in each qith a separate portal to choose destination
 * 
 * GM users must select a token to act as the summoner
 * Player users must have their character configured under player configuration (linked to their user in the bottom left list of connected/disconnected users)
 * The above can be disabled in config to allow players users to use any owned token as the summoner, but they must select a token
 *
 * Uses standard Pathfinder 1e summon monster/nature's ally rules
 * (1 round/CL, close range, extend metamagic doubles duration, reach metamagic is medium range)
 * 
 * Supports Augment Summoning, Harrowed Summoning, and the 4 default alignment templates
 **/
const config = {
    packSource: ["summons-for-pf1e"], // list of package sources for summons actor folders
    packTemplateSource: "summons-for-pf1e.summon-templates", // list of package sources for summoning templates
    ignoreCompendiums: [""],
    destinationFolder: "Summons", // Folder to file summons in when imported. Will be auto-created by GM users, but not players
    renameAugmented: true, // Appends "(Augmented)" to the token if augmented"
    useUserLinkedActorOnly: true, // Change to false to allow users to use any selected token they own as the summoner
    enableAugmentSummoning: false,      // Show Augment Summoning checkbox
    enableExtendMetamagic: false,       // Show Extend Metamagic checkbox
    enableReachMetamagic: false,        // Show Reach Metamagic checkbox
    enableConjuredArmor: true,         // Show Conjured Armor checkbox
    enableHarrowedSummoning: true      // Show Harrowed Summoning section
};

// Build options for folders to summon from
let packOptions = `<option value=""></option>` + game.packs.filter(p => p.documentName === "Actor" && config.packSource.includes(p.metadata.packageName) && !config.ignoreCompendiums.includes(p.metadata.name) && p.visible).map(p => `<option value="${p.collection}">${p.title}</option>`);

let summonerActor;
let summonerToken;
let classArray = [];
let gNumSpawned = 0;
let gNeedSpawn = 100;
let createdMonster;
let range = 0;

console.log("Summon Macro started");

// Get actor and token info
if (game.user.isGM || !config.useUserLinkedActorOnly) {
    // GMs must have a token selected
    let selectedTokens = canvas.tokens.controlled;
    console.log("GM mode, selectedTokens.length:", selectedTokens.length);
    if (!selectedTokens.length) {
        ui.notifications.warn("No token chosen as summoner.");
        console.log("No token chosen as summoner (GM branch)");
    } else {
        summonerToken = selectedTokens[0];
        summonerActor = summonerToken.actor;
        console.log("GM mode, summonerToken:", summonerToken?.name, "summonerActor:", summonerActor?.name);
    }
}
else {
    // Non GMs must have a character and a token for that character on the map
    summonerActor = game.user.character;
    console.log("Player mode, summonerActor:", summonerActor?.name);
    if (!summonerActor) {
        ui.notifications.warn("No token chosen as summoner.");
        console.log("No character assigned (Player branch)");
    } else {
        let ownedTokens = canvas.tokens.ownedTokens.filter(o => o.actor && o.actor.id === summonerActor.id);
        console.log("Player mode, ownedTokens.length:", ownedTokens.length);
        if (!ownedTokens.length) {
            ui.notifications.warn(`No token of summoner ${summonerActor.name} available.`);
            console.log("No owned tokens for player character");
        } else {
            summonerToken = ownedTokens[0];
            console.log("Player mode, summonerToken:", summonerToken?.name);
        }
    }
}

console.log("After selection: summonerActor:", summonerActor, "summonerToken:", summonerToken);

if (summonerActor && summonerToken) {
    console.log("Token and actor found:", summonerActor.name, summonerToken.name);
    // Build list of character's classes sorted by level (high to low)
    classArray = Object.values(summonerActor.items.filter(o => o.type === 'class')).sort((a, b) => {return b.system.level - a.system.level});
    let classOptions = classArray.map((p, index) => `<option value="${index}">${p.name} (Level ${p.system.level})</option>`);
    
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
                <label>CL Class:</label>
                <select id="classSelect">${classOptions}</select>
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
                <input type="checkbox" id="augmentCheck">
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
        // Disable template select if monsterSelect id doesn't end with *
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
    console.log("About to render dialog");
}

/**
 * On change of source dropdown, populate summon options from the chosen folder
 **/
async function populateMonster(htm, event) {
    // Get the chosen folder
    let selectedPack = event.target.value;
    let monsterSelect = htm.find("#monsterSelect")[0];

    // Populate the options or leave blank if no target chosen
    let monsterOptions = "";
    if (selectedPack) {
        let monsterList = await game.packs.get(selectedPack).getIndex();
        monsterOptions = monsterList.contents.sort((a, b) => { return a.name > b.name ? 1 : -1; }).map(p => `<option value="${p._id}">${p.name}</option>`);
    }

    // Replace options
    monsterSelect.innerHTML = monsterOptions;

    // Re-attach the change handler and update state
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
 * Imports the selected monster into the game world, sorts it into the desired folder (if any),
 * spawns the desired number of tokens on top of the summoner's token, creates a chat message giving
 * details about the summon that occured, and creates a Turn Alert alert for when the summon ends (if
 * there is currently combat and Turn Alert is enabled)
 **/
async function importMonster(html) {
    // Get the details of the selected summon
    let selectedPack = html.find("#sourceSelect")[0].value;
    let selectedMonster = html.find("#monsterSelect")[0].value;
    
    // Gets info about the destination folder, creates it if it does not exist
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
    
    // Import the monster from the compendium
    console.log("Importing Actor");
    let monsterEntity = await game.packs.get(selectedPack).getDocument(selectedMonster);
    
    // Remove duplicate, just create from toObject
    createdMonster = await Actor.create(monsterEntity.toObject());
    // Ensure we have the fully initialized Actor document
    createdMonster = game.actors.get(createdMonster.id);

    console.log("Actor Imported");
    
    // Update the actor permissions
    let currentPermission = createdMonster.permission;
    let updatedPermission = currentPermission[game.userId] = 3;
    if (game.user.isGM && summonerActor.hasPlayerOwner) {
        let giveOwnerCheck = html.find('#ownerCheck').length > 0 && html.find('#ownerCheck')[0].checked;
        if (giveOwnerCheck) updatedPermission = summonerActor.permission;
    }
    await createdMonster.update({"folder": folderID, "permission": updatedPermission});
    console.log("Permissions updated");
    
    // Get info about summon count
    let countFormula = html.find("#summonCount").val();
    let roll;
    let rollResult = 0;
    let rollHtml = "";
    
    let testRoll = new Roll(countFormula);
    
    // Verify summon count formula is valid and will result in at least 1 summon
    if (!Roll.validate(countFormula) || (await testRoll.evaluate({minimize: true}).total <= 0)) {
        ui.notifications.error(`${countFormula} not a valid roll formula. Defaulting to 1.`);
        countFormula = "1";
    }
    
    // Calculate the roll
    testRoll = new Roll(countFormula);
    roll = await testRoll.roll();
    rollResult = roll.total;
    gNeedSpawn = rollResult;
    
    // Find chosen caster level info
    let chosenIndex = parseInt(html.find("#classSelect").val());
    let classCL = classArray[chosenIndex].system.level;
    let casterLevel = classCL;
    let clOverride = parseInt(html.find("#clOverride").val());
    
    // Validate caster level override is a number > 0
    if (!isNaN(clOverride)) {
        if (clOverride <= 0) ui.notifications.error(`${clOverride} not a valid caster level. Defaulting to class level.`);
        else casterLevel = clOverride;
    }
    
    //Set up buff for augment
    let buffData = null;
    if (html.find("#augmentCheck")[0] && html.find("#augmentCheck")[0].checked) {
        buffData = { type: "buff", name: "Augment Summoning", system: { buffType: "temp" } };
    }

    //Set up buff for harrowed summoning
    let buffDataH = null;
    if (html.find("#harrow1")[0] && html.find("#harrow1")[0].value !== "") {
        buffDataH = { type: "buff", name: "Harrowed Summoning", system: { buffType: "temp" } };
    }
    
    // Set up range as close or medium based on caster level and range metamagic
    if (html.find("#reachCheck")[0] && html.find("#reachCheck")[0].checked) range = (100 + (casterLevel * 10));
    else range = (25 + (Math.floor(casterLevel / 2) * 5));
    
    // Double caster level for extend metamagic
    if (html.find("#extendCheck")[0] && html.find("#extendCheck")[0].checked) casterLevel *= 2;

    //Modify caster level for harrowed summoning
    if (html.find("#harrowMatch")[0])
        casterLevel = Math.floor(casterLevel * html.find("#harrowMatch")[0].value);

    // Add Template to actor and change actor's name
    let templateSelect = html.find("#template");
    let templateName = templateSelect.prop("disabled") ? "" : templateSelect.val();
    if(templateName !== "") {
        //let packs = game.packs.filter(p => p.documentName === "Item" && config.packSource.includes(p.metadata.packageName) && !config.ignoreCompendiums.includes(p.metadata.name) && p.visible);
        let pack = game.packs.get(config.packTemplateSource);
        console.log("Pack:", pack);

        let template = null;
        //for (pack of packs){
            let index = await pack.getIndex();
            let entry = index.find(e => e.name === templateName);
            if (entry) {
                template = await pack.getDocument(entry._id);
                //break;
            }
        //}

        if (template) {
            console.log("Template Found:", template);
            await createdMonster.createEmbeddedDocuments("Item", [template]);
            let actorName = createdMonster.name + ', ' + templateName;
            await createdMonster.update({"name": actorName});
            await createdMonster.update({"token.name": actorName});

            let eres = await createdMonster.system.traits.eres.value;
            let hd = await createdMonster.system.attributes.hd.total;
            let resNum = 5;
            let drNum = 0;
            
            console.log("HD:", hd);
            console.log("Initial eres:", eres);

            if (hd >= 5) {
                resNum = 10;
                drNum = 5;
            }
            if (hd >= 11) {
                resNum = 15;
                drNum = 10;
            }

            const acidRes = ["Celestial", "Entropic", "Resolute"];
            const coldRes = ["Celestial", "Counterpoised", "Dark", "Fiendish", "Resolute"];
            const elecRes = ["Celestial", "Counterpoised", "Resolute"];
            const fireRes = ["Counterpoised", "Entropic", "Fiendish", "Resolute"];

            if (acidRes.includes(templateName)) {
                eres.push({"amount": resNum, "types": ["acid"]});
            }
            if (coldRes.includes(templateName)) {
                eres.push({"amount": resNum, "types": ["cold"]});
            }
            if (elecRes.includes(templateName)) {
                eres.push({"amount": resNum, "types": ["electric"]});
            }
            if (fireRes.includes(templateName)) {
                eres.push({"amount": resNum, "types": ["fire"]});
            }

            await createdMonster.update({"system.traits.eres.value": eres});

            if (hd >= 5){
                let ddr = createdMonster.system.traits.dr.value;
                console.log("Initial DR:", ddr);

                const typeMap = new Map();
                typeMap.set("Celestial", "Evil");
                typeMap.set("Fiendish", "Good");
                typeMap.set("Resolute", "Chaos");
                typeMap.set("Entropic", "Law");

                let drType = "-";
                try {
                    drType = typeMap.get(templateName);
                } catch (e) {
                    console.log("DR Bypass not Found");
                }

                ddr.push({"amount": drNum, "types": [drType]});
                console.log("Updated DR array:", ddr);
                await createdMonster.update({"system.traits.dr.value": ddr});
                console.log("Updated DR:", createdMonster.system.traits.dr.value);
            }

        } else {
            ui.notifications.error(`Template ${templateName} not found.`);
        }
        //sets alignment to that of summoners for templated creatures
        createdMonster.update({"system.details.alignment": summonerActor.system.details.alignment});
    }

    //sets disposition of actor prototype token to that of summoner
    console.log("summoner token" + summonerToken);
    console.log("summoner disposition" + summonerToken.document.disposition);
    await createdMonster.update({"prototypeToken.disposition": summonerToken.document.disposition});
    console.log("new token disposition" + createdMonster.prototypeToken.disposition);
    
    // Create the buff on the actor for augment, set the bonuses, hide it on the token, and change actor's name
    if (buffData) {
        await createdMonster.createEmbeddedDocuments("Item", [buffData]);
        let buff = createdMonster.items.find(o => o.name === "Augment Summoning" && o.type === "buff");
        let changes = [];
        changes.push({formula: "4", priority: 1, target: "ability", subTarget: "str", modifier: "enh"});
        changes.push({formula: "4", priority: 1, target: "ability", subTarget: "con", modifier: "enh"});
        await buff.update({"system.changes": changes, "system.hideFromToken": true});
        await buff.update({"system.active": true});
        let actorName = createdMonster.name + " (Augmented)";
        await createdMonster.update({"name": actorName});
        await createdMonster.update({"token.name": actorName});
    }

     // Create the buff on the actor for harrowed summoning, set the bonuses, hide it on the token
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
        await buff.update({"system.changes": changes, "system.hideFromToken": true});
        await buff.update({"system.active": true});
    }

    // Conjured Armor Buff
    if (html.find("#conjuredArmorCheck")[0]?.checked) {
        // Find the summoner's psychic class level
        let psychicClass = classArray.find(c => c.name.toLowerCase().includes("psychic"));
        let psychicLevel = psychicClass ? psychicClass.system.level : 0;
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
                    changes: [
                        {
                            formula: `${deflectionBonus}`,
                            priority: 1,
                            target: "ac",
                            type: "deflection",
                        }
                    ],
                    hideFromToken: true,
                    active: true
                }
            };
            await createdMonster.createEmbeddedDocuments("Item", [conjuredArmorBuff]);
        }
    }

    // Wait for summoner to spawn the rolled number of tokens on the canvas
    console.log("Spawning summons");
    let firstSummonedToken = null;
    while (gNumSpawned < gNeedSpawn) {
        ui.notifications.info(`Click spawn location for ${createdMonster.name} within ${range} ft of summoner (${gNumSpawned} of ${gNeedSpawn})`);
        let portal = new Portal();
        console.log("Portal created");
        console.log("Monster: " + createdMonster.name);

        await portal.addCreature(createdMonster);
        console.log("Creature added to portal:", createdMonster);

        portal.color("#9e17cf");
        portal.texture("icons/magic/symbols/runes-triangle-magenta.webp");
        portal.origin(summonerToken);
        portal.range(range);
        console.log("Portal configured with color, texture, origin, and range");

        await portal.pick();
        console.log("Portal pick completed");

        const spawnedTokens = await portal.spawn();
        console.log("Portal spawn completed");

        // Save the first summoned token
        if (gNumSpawned === 0 && spawnedTokens && spawnedTokens.length > 0) {
            firstSummonedToken = spawnedTokens[0];
        } else if (gNumSpawned === 0 && canvas.tokens.placeables) {
            // Fallback: try to find the first token for this actor
            firstSummonedToken = canvas.tokens.placeables.find(t => t.actor && t.actor.id === createdMonster.id);
        }

        gNumSpawned++;
        console.log("Spawned:", gNumSpawned);
    }
    ui.notifications.info("Done spawning summons!");

    // Apply the duration buff to the summoner (caster) instead of the summoned monster
    if (summonerActor) {
        let durationBuff = {
            type: "buff", 
            name: "Active Summon Spell", 
            img: "icons/magic/symbols/runes-triangle-blue.webp",
            system: { 
                buffType: "spell", 
                duration: { units: "round", value: casterLevel, end: "initiative" }, 
                hideFromToken: true, 
                active: true,
                scriptCalls: [
                    {
                        type: "script",
                        category: "toggle",
                        value: `
if (!state) {
    // Only prompt once per expiration
    if (!item.getFlag("world", "summonDeletePrompted")) {
        let actorId = item.getFlag("world", "summonedActorId");
        if (!actorId) {
            ChatMessage.create({content: '<p>No summon to delete.</p>'});
            item.delete();
            return;
        }
        // Create a chat card with a delete button
        let chatContent = '<div class="pf1 chat-card">' +
            '<header class="card-header flexrow">' +
            '<h3 class="actor-name">Summon Expired</h3>' +
            '</header>' +
            '<div class="result-text">' +
            '<p>The summon duration has expired. <button data-action="delete-summon" data-actor-id="' + actorId + '" data-item-id="' + item.id + '">Delete Summon</button></p>' +
            '</div>' +
            '</div>';
        ChatMessage.create({content: chatContent});
        await item.setFlag("world", "summonDeletePrompted", true);
    }
}
`
                    }
                ]
            },
            flags: {
                world: {
                    summonedActorId: createdMonster.id
                }
            }
        };
        await summonerActor.createEmbeddedDocuments("Item", [durationBuff]);
    } else {
        ui.notifications.warn("Could not find summoner to apply duration buff.");
    }

    // After all tokens are spawned
    if (game.combat) {
        let summonerCombatant = game.combat.combatants.find(c => c.actorId === summonerActor.id);
        let initiative = 0;
        if (summonerCombatant) {
            initiative = summonerCombatant.initiative !== null ? summonerCombatant.initiative + 0.01 : 0;
        }
        // Find all tokens for this actor on the canvas
        let tokens = canvas.tokens.placeables.filter(t => t.actor && t.actor.id === createdMonster.id);

        let firstSummonedCombatantId = null;
        for (let token of tokens) {
            let combatant = game.combat.combatants.find(c => c.tokenId === token.id);
            if (!combatant) {
                let [newCombatant] = await game.combat.createEmbeddedDocuments("Combatant", [{
                    tokenId: token.id,
                    actorId: token.actor.id
                }]);
                if (newCombatant && initiative !== null) {
                    await newCombatant.update({initiative});
                }
                if (!firstSummonedCombatantId && newCombatant) firstSummonedCombatantId = newCombatant.id;
            } else {
                if (!firstSummonedCombatantId) firstSummonedCombatantId = combatant.id;
            }
        }
        // Wait a tick to ensure combatants are updated
        await new Promise(resolve => setTimeout(resolve, 100));
        // Find the index of the first summoned combatant in the tracker
        let combatantArr = Array.from(game.combat.combatants);
        let idx = combatantArr.findIndex(c => c.id === firstSummonedCombatantId);
        if (idx !== -1) {
            let setIdx = Math.max(0, idx - 1);
            console.log(`Setting turn to index ${setIdx} (${combatantArr[setIdx]?.name})`);
            await game.combat.update({turn: setIdx});
            ui.notifications.info(`Turn set to summoned monster: ${combatantArr[setIdx].name}`);
        } else {
            ui.notifications.warn("Could not set turn to summoned monster.");
        }
    }

    // Create chat message about summon
    let msg = `
    <div class="pf1 chat-card">
        <header class="card-header flexrow">
            <h3 class="actor-name">Summoning!</h3>
        </header>
        <div class="result-text">
            <p><a class="inline-roll inline-result" title="${roll.formula}" data-roll="${encodeURI(JSON.stringify(roll))}"><i class="fas fa-dice-d20"></i> ${roll.total}</a> ${createdMonster.name} summoned for ${casterLevel} rounds.</p>
        </div>
    </div>`;

    ChatMessage.create({
        content: msg
    });
}
// Set up a listener for the delete button
if (!window._summonDeleteHookId) {
    window._summonDeleteHookId = Hooks.on("renderChatMessage", (message, html, data) => {
        html.find('button[data-action="delete-summon"]').click(async function() {
            const actorId = this.dataset.actorId;
            const itemId = this.dataset.itemId;
            // Find all tokens for this actor
            let toks = canvas.tokens.placeables.filter(t => t.actor && t.actor.id === actorId);
            let tokenIds = toks.map(t => t.id);

            // Remove combatants for these tokens and actor
            if (game.combat) {
                let combatants = game.combat.combatants.filter(c =>
                    (c.tokenId && tokenIds.includes(c.tokenId)) || c.actorId === actorId
                );
                for (let combatant of combatants) {
                    await combatant.delete();
                }
            }

            // Delete all tokens for this actor
            for (let tok of toks) {
                await tok.document.delete();
            }
            // Delete the actor
            let monster = game.actors.get(actorId);
            if (monster) await monster.delete();
            // Delete the buff item from the summoner (GM can always do this)
            let summoner = game.actors.find(a => a.items.get(itemId));
            if (summoner) {
                let item = summoner.items.get(itemId);
                if (item) {
                    // If GM, use GM privileges to delete the item
                    if (game.user.isGM) {
                        await Item.deleteDocuments([itemId], {parent: summoner});
                    } else {
                        await item.delete();
                    }
                }
            }
            ChatMessage.create({content: "<p>Summon deleted.</p>"});
        });
    });
}