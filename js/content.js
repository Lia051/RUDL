import { round, score } from './score.js';

/**
 * Folders to load levels and editors from
 * You can edit this array to include any directories you want
 */
const dirs = ['/data/easydemons', '/data/mediumdemons'];

/**
 * Fetch all levels from the listed directories
 */
export async function fetchList() {
    let combinedList = [];

    for (const dir of dirs) {
        try {
            const listResult = await fetch(`${dir}/_list.json`);
            const list = await listResult.json();

            const levels = await Promise.all(
                list.map(async (path, rank) => {
                    try {
                        const levelResult = await fetch(`${dir}/${path}.json`);
                        const level = await levelResult.json();
                        return [
                            {
                                ...level,
                                path,
                                records: level.records.sort(
                                    (a, b) => b.percent - a.percent
                                ),
                            },
                            null,
                        ];
                    } catch {
                        console.error(`Failed to load level #${rank + 1} ${path} in ${dir}.`);
                        return [null, path];
                    }
                })
            );

            combinedList = combinedList.concat(levels);
        } catch {
            console.error(`Failed to load list from ${dir}.`);
        }
    }

    return combinedList;
}

/**
 * Fetch all editors from the first folder that has an _editors.json
 * (you can modify this logic if you want to combine editors from all folders)
 */
export async function fetchEditors() {
    for (const dir of dirs) {
        try {
            const editorsResults = await fetch(`${dir}/_editors.json`);
            const editors = await editorsResults.json();
            return editors;
        } catch {
            console.warn(`No _editors.json found in ${dir}`);
        }
    }
    return null;
}

/**
 * Fetch leaderboard based on all levels
 */
export async function fetchLeaderboard() {
    const list = await fetchList();

    const scoreMap = {};
    const errs = [];

    list.forEach(([level, err], rank) => {
        if (err) {
            errs.push(err);
            return;
        }

        // Verification
        const verifier = Object.keys(scoreMap).find(
            (u) => u.toLowerCase() === level.verifier.toLowerCase()
        ) || level.verifier;

        scoreMap[verifier] ??= { verified: [], completed: [], progressed: [] };
        const { verified } = scoreMap[verifier];
        verified.push({
            rank: rank + 1,
            level: level.name,
            score: score(rank + 1, 100, level.percentToQualify),
            link: level.verification,
        });

        // Records
        level.records.forEach((record) => {
            const user = Object.keys(scoreMap).find(
                (u) => u.toLowerCase() === record.user.toLowerCase()
            ) || record.user;

            scoreMap[user] ??= { verified: [], completed: [], progressed: [] };
            const { completed, progressed } = scoreMap[user];

            if (record.percent === 100) {
                completed.push({
                    rank: rank + 1,
                    level: level.name,
                    score: score(rank + 1, 100, level.percentToQualify),
                    link: record.link,
                });
            } else {
                progressed.push({
                    rank: rank + 1,
                    level: level.name,
                    percent: record.percent,
                    score: score(rank + 1, record.percent, level.percentToQualify),
                    link: record.link,
                });
            }
        });
    });

    // Wrap in extra Object containing the user and total score
    const res = Object.entries(scoreMap).map(([user, scores]) => {
        const { verified, completed, progressed } = scores;
        const total = [verified, completed, progressed]
            .flat()
            .reduce((prev, cur) => prev + cur.score, 0);

        return {
            user,
            total: round(total),
            ...scores,
        };
    });

    // Sort by total score
    return [res.sort((a, b) => b.total - a.total), errs];
}
