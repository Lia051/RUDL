import { round, score } from './score.js';

/**
 * Main folder for lists and editors
 */
const mainDir = '/data';

/**
 * Additional folders to try when fetching levels
 */
const levelDirs = ['/data/easydemons', '/data/mediumdemons'];

/**
 * Fetch all levels from the main directory, trying multiple folders for each level
 */
export async function fetchList() {
    let combinedList = [];

    try {
        const listResult = await fetch(`${mainDir}/_list.json`);
        if (!listResult.ok) throw new Error(`HTTP ${listResult.status}`);
        const list = await listResult.json();

        const levels = await Promise.all(
            list.map(async (path, rank) => {
                let level = null;
                let triedDirs = [];

                // Try each directory until level is found
                for (const dir of levelDirs) {
                    try {
                        const levelResult = await fetch(`${dir}/${path}.json`);
                        if (!levelResult.ok) throw new Error(`HTTP ${levelResult.status}`);
                        level = await levelResult.json();
                        break;
                    } catch {
                        triedDirs.push(dir);
                    }
                }

                if (!level) {
                    console.error(`Failed to load level #${rank + 1} ${path} from:`, triedDirs);
                    return [null, path];
                }

                return [
                    {
                        ...level,
                        path,
                        records: level.records.sort((a, b) => b.percent - a.percent),
                    },
                    null,
                ];
            })
        );

        combinedList = combinedList.concat(levels);
    } catch (e) {
        console.error(`Failed to load list from ${mainDir}:`, e);
    }

    return combinedList;
}

/**
 * Fetch editors from the main directory
 */
export async function fetchEditors() {
    try {
        const editorsResult = await fetch(`${mainDir}/_editors.json`);
        if (!editorsResult.ok) throw new Error(`HTTP ${editorsResult.status}`);
        const editors = await editorsResult.json();
        return editors;
    } catch (e) {
        console.warn(`Failed to load editors from ${mainDir}:`, e);
        return null;
    }
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
