import { Level } from "level";
import Client from "mpp-client-net";
import { createInterface } from "readline";

const rl = createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.on("line", line => {
    try {
        console.log(eval(line));
    } catch (err) {
        console.error(err);
    }
});

const db = new Level("./toad.db");
const cl = new Client("wss://mppclone.com:8443", process.env.MPPNET_TOKEN);

const prefixes = ["t", "🐸"];

const bugList: string[] = [];

interface User {
    _id: string;
    nickels: number;
    inventory: (Item | Bug)[];
}

interface Item {
    id: string;
    name: string;
    amount: number;
    sellValue: number;
    edible?: true;
}

interface ShopItem {
    id: string;
    buyValue: number;
    sellValue?: number; // defaults to buyValue
    amount?: number; // defaults to 1
}

class Shop {
    public static items = new Array<ShopItem>(
        {
            id: "hammer",
            buyValue: 30
        },
        {
            id: "burger",
            buyValue: 10
        }
    );

    public static load() {
        loadShop();
    }

    public static save() {
        saveShop();
    }

    public static addItem(item: ShopItem) {
        Shop.items.push(item);
        this.save();
    }

    public static getItem(id: string) {
        return Shop.items.find(item => item.id === id);
    }

    public static getItems() {
        return [...Shop.items];
    }

    public static getItemAmount(id: string) {
        const item = Shop.getItem(id);

        if (!item) return 0;

        return item.amount;
    }

    public static getItemFuzzy(nameOrID: string) {
        return this.items.find(async item => {
            const realItem = await getItem(item.id);
            return item.id === nameOrID || realItem?.name === nameOrID;
        });
    }
}

// singleton
class Field {
    public static bugs: string[] = []; // IDs of bugs in the field

    public static addBug(id: string) {
        this.bugs.push(id);
    }

    public static removeBug(id: string): void {
        const index = this.bugs.indexOf(id);
        if (index !== -1) {
            this.bugs.splice(index, 1);
        }
        console.log(this.bugs);
    }

    public static getBug(id: string) {
        return this.bugs.find(bug => bug === id);
    }

    public static generateRandomBugID() {
        return bugList[Math.floor(Math.random() * bugList.length)] as string;
    }

    static {
        // field ticker (add and remove random bugs)
        setInterval(() => {
            const r = Math.random();
            if (r < 0.5) {
                this.addBug(this.generateRandomBugID());
            } else {
                const index = Math.floor(Math.random() * this.bugs.length);
                this.bugs.splice(index, 1);
            }
            console.log(Field.bugs);
        }, 10 * 1000);
    }
}

interface Bug {
    id: string;
    name: string;
    description: string;
    sellValue: number;
    amount?: number;
    emoji?: string;
}

async function load() {
    try {
        const dbPrefixes = await db.get("prefixes");

        if (typeof dbPrefixes === "string") {
            const prefixes = JSON.parse(dbPrefixes);

            for (const prefix of prefixes) {
                prefixes.push(prefix);
            }
        }

        Shop.load();

        loadBugs();
    } catch (err) {
        console.error(err);
    }

    cl.start();
}

load();

async function getUser(id: string) {
    const user = await db.get(`user:${id}`);

    if (typeof user === "string") {
        return JSON.parse(user);
    }

    return null;
}

async function saveUser(user: User) {
    await db.put(`user:${user._id}`, JSON.stringify(user));
}

async function saveItem(item: Item) {
    await db.put(`item:${item.id}`, JSON.stringify(item));
}

async function getItem(id: string): Promise<Item | null> {
    const item = await db.get(`item:${id}`);

    if (typeof item === "string") {
        return JSON.parse(item);
    }

    return null;
}

async function getItems() {
    const items = await db.get("items");

    if (typeof items === "string") {
        return JSON.parse(items);
    }

    return [];
}

async function saveShop() {
    await db.put("shop", JSON.stringify(Shop.items));
}

async function loadShop() {
    const shop = await db.get("shop");

    if (typeof shop === "string") {
        Shop.items = JSON.parse(shop);
    }
}

async function getBug(id: string) {
    const bug = await db.get(`bug:${id}`);

    if (typeof bug === "string") {
        return JSON.parse(bug);
    }

    return null;
}

async function loadBugs() {
    for await (const [id, jbug] of db.iterator({ gt: "bug:", lt: "bug~" })) {
        const bug = JSON.parse(jbug);
        bugList.push(bug.id);
    }
}

// server connection observer detection
cl.on("hi", msg => {
    console.log("Connected to server");
    cl.setChannel("cheez");
});

let currentChannel = "";
let desiredUser = {
    name: "toad",
    color: "#000000"
};

cl.on("p", p => {
    if (p.name === desiredUser.name && p.color === desiredUser.color) return;
    cl.sendArray([
        {
            m: "userset",
            set: desiredUser
        }
    ]);
});

cl.on("ch", msg => {
    if (currentChannel === msg.ch._id) return;

    currentChannel = msg.ch._id;
    console.log("Joined channel", currentChannel);
});

cl.on("a", msg => {
    try {
        const hex = msg.p.color;
        const rgb = hex
            .match(/^#(..)(..)(..)$/)!
            .slice(1)
            .map((c: string) => parseInt(c, 16));
        console.log(
            `\x1b[37m${msg.p._id.substring(0, 6)}\x1b[0m \x1b[38;2;${rgb[0]};${
                rgb[1]
            };${rgb[2]}m${msg.p.name}: ${msg.a}\x1b[0m`
        );
    } catch (err) {
        console.log(`${msg.p._id.substring(0, 6)} ${msg.p.name}: ${msg.a}`);
    }

    handleCommand(msg);
});

interface Context {
    args: string[];
    msg: {
        m: "a";
        a: string;
        p: Participant;
        t: number;
    };
    channel: string;
    usedCommand: string;
    usedPrefix: string;
    user: User;
}

async function handleCommand(msg: {
    m: "a";
    a: string;
    p: Participant;
    t: number;
}) {
    const args = msg.a.split(" ");
    const channel = cl.channel._id;
    let user: User = await getUser(msg.p._id);
    if (!user) {
        user = {
            _id: msg.p._id,
            nickels: 0,
            inventory: []
        };

        await saveUser(user);
    }

    const usedPrefix = prefixes.find(prefix => msg.a.startsWith(prefix));
    if (!usedPrefix) return;

    const usedCommand = args[0]?.substring(usedPrefix.length);
    if (!usedCommand) return;

    const context: Context = {
        args,
        msg,
        channel,
        user,
        usedCommand,
        usedPrefix
    };

    const command = [...commandGroups.values()]
        .map(group => group.commands)
        .flat()
        .find(command => command.aliases.includes(usedCommand));

    console.log(command);

    if (!command) return;

    try {
        const output = await command.callback(context);

        if (typeof output === "string") {
            cl.sendArray([
                {
                    m: "a",
                    message: output
                }
            ]);
        }
    } catch (err) {
        console.error(err);
    }
}

function formatBug(bug: Bug) {
    return `${bug.emoji || "🐛"} ${bug.name}`;
}

function formatParticipant(p: Participant) {
    return `@${p._id}`;
}

function formatItem(item: Item) {
    return `${item.name}`;
}

function formatBalance(balance: number) {
    return `${balance.toFixed()} nickels`;
}

class Command {
    constructor(
        public aliases: string[],
        public description: string,
        public usage: string,
        public permission: string,
        public callback: (ctx: Context) => Promise<string | void>
    ) {
        if (!this.permission) this.permission = `command.${this.aliases[0]}`;
    }
}

class CommandGroup {
    constructor(
        public name: string,
        public description: string,
        public commands: Command[]
    ) {}
}

const commandGroups = new Map<string, CommandGroup>();

commandGroups.set(
    "info",
    new CommandGroup("info", "Information commands", [
        new Command(
            ["help", "h", "commands", "cmds"],
            "Show all commands",
            "help",
            "command.help",
            async ctx => {
                const groups = [...commandGroups.values()].map(group => {
                    return `\`${group.name}\` - ${group.description}`;
                });

                const groupText = `**Help groups:** ${groups.join(" | ")}`;

                if (!ctx.args[1]) {
                    return groupText;
                }

                const group = commandGroups.get(ctx.args[1]);

                if (!group) {
                    return groupText;
                }

                const commands = group.commands.map(command => {
                    return `\`${command.aliases[0]}\` - ${command.description}`;
                });

                return `Commands in **${group.name}**: ${commands.join(" | ")}`;
            }
        ),
        new Command(
            ["info", "about"],
            "Bot information",
            "info",
            "command.info",
            async ctx => {
                return "This bloopin' frog bot was made by Hri7566";
            }
        )
    ])
);

commandGroups.set(
    "bugs",
    new CommandGroup("bugs", "Bug catching commands", [
        new Command(
            ["shop", "s"],
            "Shop commands",
            "shop",
            "command.shop",
            async ctx => {
                const items = Shop.getItems().map(async shopItem => {
                    const item = await getItem(shopItem.id);
                    if (!item) return null;
                    return `${item.name} - ${formatBalance(shopItem.buyValue)}`;
                });

                return `**Shop items:** ${(await Promise.all(items)).join(
                    " | "
                )}`;
            }
        ),
        new Command(
            ["buy"],
            "Buy an item from the shop",
            "buy",
            "command.buy",
            async ctx => {
                if (!ctx.args[1])
                    return `check the ${ctx.usedPrefix}shop please`;

                const shopItem = Shop.getItem(ctx.args[1]);
                if (!shopItem)
                    return `I don't have an item called "${ctx.args[1]}"`;

                const item = await getItem(shopItem.id);
                if (!item)
                    return "The item you are trying to buy is no longer available.";

                // TODO: check price against user balance
                const balance = ctx.user.nickels;
                if (balance < shopItem.buyValue)
                    return `You don't have enough nickels to buy this item.`;

                // Add item to user inventory
                ctx.user.inventory.push(item);
                await saveUser(ctx.user);
                return `Bought ${formatItem(item)}`;
            }
        ),
        new Command(
            ["look", "field", "l"],
            "Look around the field",
            "look",
            "command.look",
            async ctx => {
                const list = Field.bugs.map(async bid => {
                    const bug = await getBug(bid);
                    if (!bug) return null;
                    return `${bug.description.toLowerCase()}`;
                });

                let listText = (await Promise.all(list)).join(", ");
                listText = listText.replace(/, ([^,]*)$/, ", and $1");

                return `**Bugs in the field:** ${listText || "(none)"}`;
            }
        ),
        new Command(
            ["catch", "c"],
            "Catch a bug from the field",
            "catch",
            "command.catch",
            async ctx => {
                const bugName = ctx.args[1];
                if (!bugName)
                    return "What bug do you want to catch from the field?";

                let foundBugData: Bug | null = null;

                for (const bug of bugList) {
                    const bugData = await getBug(bug);
                    if (!bugData) continue;
                    if (bugData.name.toLowerCase() === bugName.toLowerCase()) {
                        foundBugData = bugData;
                        break;
                    }
                }

                if (!foundBugData)
                    return `There is no bug called "${bugName}".`;

                const bugIndex = Field.bugs.indexOf(foundBugData.id);
                if (bugIndex === -1)
                    return `The bug "${foundBugData.name}" is not in the field.`;

                Field.removeBug(foundBugData.id);

                // put bug in user's bag
                ctx.user.inventory.push(foundBugData);
                await saveUser(ctx.user);

                return `You caught ${
                    foundBugData.name.match(/^[aeiou]/gi) ? "an" : "a"
                } ${formatBug(
                    foundBugData
                )} from the field and put it in your ${ctx.usedPrefix}bag.`;
            }
        ),
        new Command(
            ["bag", "b"],
            "View your bag",
            "bag",
            "command.bag",
            async ctx => {
                const bag = ctx.user.inventory;
                if (!bag.length) return "You don't have any bugs in your bag.";

                const bagText = bag
                    .map(bug => formatBug(bug as Bug))
                    .join(", ");

                return `Your bag: ${bagText}`;
            }
        ),
        new Command(
            ["nickels", "n", "balance", "bal"],
            "View your balance",
            "bal",
            "command.bal",
            async ctx => {
                if (typeof ctx.user.nickels !== "number") {
                    ctx.user.nickels = 0;
                    await saveUser(ctx.user);
                }
                return `You have ${formatBalance(ctx.user.nickels)}`;
            }
        ),
        new Command(
            ["sell", "s"],
            "Sell an item from your bag",
            "sell",
            "command.sell",
            async ctx => {
                const arg = ctx.args[1];
                if (!arg) return `check the ${ctx.usedPrefix}bag please`;

                const item = ctx.user.inventory.find(item => {
                    return item.name.toLowerCase() === arg.toLowerCase();
                }) as Bug | Item;

                if (!item)
                    return `I don't have an item called "${ctx.args[1]}"`;

                const itemIndex = ctx.user.inventory.indexOf(item);
                if (itemIndex === -1)
                    return `The item "${item.name}" is not in your bag.`;

                if (!item.sellValue) return "This item cannot be sold.";

                ctx.user.inventory.splice(itemIndex, 1);
                ctx.user.nickels += item.sellValue;
                await saveUser(ctx.user);

                return `Sold ${formatItem(item as Item)} for ${formatBalance(
                    item.sellValue
                )}`;
            }
        ),
        new Command(
            ["eat", "e"],
            "Eat an item from your bag",
            "eat",
            "command.eat",
            async ctx => {
                const arg = ctx.args[1];
                if (!arg) return `check the ${ctx.usedPrefix}bag please`;

                const item = ctx.user.inventory.find(item => {
                    return item.name.toLowerCase() === arg.toLowerCase();
                }) as Bug | Item;

                if (!item)
                    return `I don't have an item called "${ctx.args[1]}"`;

                const itemIndex = ctx.user.inventory.indexOf(item);
                if (itemIndex === -1)
                    return `The item "${item.name}" is not in your bag.`;

                if (!(item as Item).edible) return "This item cannot be eaten.";

                ctx.user.inventory.splice(itemIndex, 1);
                ctx.user.nickels += item.sellValue;
                await saveUser(ctx.user);

                return `Eaten ${formatItem(item as Item)}`;
            }
        )
    ])
);
