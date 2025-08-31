import { round, score } from './score.js';

/**
 * Folders to load levels and editors from.
 * Must be relative to your public folder (browser-accessible paths)
 */
const dirs = ['./data/easydemons', './data/mediumdemons'];

/**
 * Fetch all levels from the listed directories
 */
export async function fetchList() {
    let combinedList = [];

    for (const dir of dirs) {
        try {
            const listResult = await fetch(`${dir}/_list.json`);
            if (!listResult.ok) throw new Error(`HTTP ${listResult.status}`);
            const list = await listResult.json();

            const levels = await Promise.all(
                list.map(async (path, rank) => {
                    try {
                        const levelResult = await fetch(`${dir}/${path}.json`);
                        if (!levelResult.ok) throw new Error(`HTTP ${levelResult.status}`);
                        const level = await levelResult.json();
                        return [
                            {
                                ...level,
                                path,
                                records: level.records.sort((a, b) => b.percent - a.percent),
                            },
                            null,
                        ];
                    } catch (e) {
                        console.error(`Failed to load level #${rank + 1} ${path} in ${dir}:`, e);
                        return [null, path];
                    }
                })
            );

            combinedList = combinedList.concat(levels);
        } catch (e) {
            console.error(`Failed to load list from ${dir}:`, e);
        }
    }

    return combinedList;
}

/**
 * Fetch all editors from all directories and merge them
 */
export async function fetchEditors() {
    const allEditors = [];

    for (const dir of dirs) {
        try {
            const editorsResult = await fetch(`${dir}/_editors.json`);
            if (!editorsResult.ok) throw new Error(`HTTP ${editorsResult.status}`);
            const editors = await editorsResult.json();
            allEditors.push(...editors);
        } catch {
            // ignore missing editors file
        }
    }

    // Remove duplicates by user ID or name (optional)
    const uniqueEditors = Array.from(
        new Map(allEditors.map((e) => [e.user?.toLowerCase() || e.name?.toLowerCase(), e])).values()
    );

    return uniqueEditors;
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

    return [res.sort((a, b) => b.total - a.total), errs];
}
