import GameProfileGraph from "./game-profile-graph";
import loadTechTree from "./lib/tech-tree/load-tech-tree";

export default async function Home() {
    const [space_age, base] = await Promise.all([loadTechTree("space-age"), loadTechTree("base")]);
    return (
        <main className="graph page">
            <GameProfileGraph datasets={{ "space-age": space_age, base }} />
        </main>
    );
}
