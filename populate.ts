// populate the database with random bugs from bug-data.yml

import { readFileSync } from "fs";
import { join } from "path";
import { Level } from "level";
import YAML from "yaml";

const db = new Level("./toad.db");
const bugData = readFileSync(join(__dirname, "bugs.yml"), "utf8");
const bugs = YAML.parse(bugData);

for (const bug of bugs) {
    db.put(`bug:${bug.id}`, JSON.stringify(bug));
}

const itemData = readFileSync(join(__dirname, "items.yml"), "utf8");
const items = YAML.parse(itemData);

for (const item of items) {
    db.put(`item:${item.id}`, JSON.stringify(item));
}
