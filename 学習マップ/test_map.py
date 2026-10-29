import json
import networkx as nx

# JSONファイルを読み込む
with open("learning_map.json", "r", encoding="utf-8") as f:
    data = json.load(f)

# 有向グラフを作成
G = nx.DiGraph()

# ノードの登録
for node in data["nodes"]:
    G.add_node(
        node["learning_item_id"],
        **node
    )

# エッジの登録
for edge in data["edges"]:
    G.add_edge(edge["source"], edge["target"])

# グラフの確認
print("ノード数:", G.number_of_nodes())
print("エッジ数:", G.number_of_edges())
print("循環なし:", nx.is_directed_acyclic_graph(G))

# 学習項目37の前提知識を取得
target_id = 37

# 直接の前提知識
direct = list(G.predecessors(target_id))

# 間接的なものも含むすべての前提知識
all_prerequisites = nx.ancestors(G, target_id)

print("直接の前提知識:", sorted(direct))
print("すべての前提知識:", sorted(all_prerequisites))