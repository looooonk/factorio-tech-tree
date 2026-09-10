import TechGraph from "./tech-graph";
import loadTechTree from "./lib/tech-tree/load-tech-tree";

export default async function Home() {
    const { nodes, edges, root_ids, manifest } = await loadTechTree();
    return (
        <main className="graph page">
            <TechGraph nodes={nodes} edges={edges} root_ids={root_ids} science_packs={manifest.science_packs} game_version={manifest.game_version} />
        </main>
    );
}
