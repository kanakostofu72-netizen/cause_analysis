import json
import networkx as nx
import matplotlib.pyplot as plt

# JSONの読み込み
with open("learning_map.json", "r", encoding="utf-8") as f:
    data = json.load(f)

# グラフの作成
G = nx.DiGraph()

for node in data["nodes"]:
    G.add_node(node["learning_item_id"])

for edge in data["edges"]:
    G.add_edge(edge["source"], edge["target"])

# 可視化
plt.figure(figsize=(16, 12))

pos = nx.spring_layout(G, seed=42)

nx.draw(
    G,
    pos,
    with_labels=True,
    node_size=600,
    font_size=9,
    arrows=True,
    arrowsize=15
)

plt.title("Learning Map")
plt.savefig("learning_map.png", dpi=300, bbox_inches="tight")
