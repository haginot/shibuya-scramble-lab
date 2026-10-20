# 阿佐ケ谷 町シミュレーション（トイモデル）
JR阿佐ケ谷駅の周り半径約400mに住民エージェント20人を置き、1日を動かすプロトタイプ。Generative Agentsを参考にしていますが、判断はルールベースと確率で決めています（LLMは使っていません）。**予測ではありません。**

## 実行
    pip install networkx matplotlib
    curl -o osm.xml "https://api.openstreetmap.org/api/0.6/map?bbox=139.6314,35.7011,139.6402,35.7083"
    python3 sim.py      # asagaya_osm.geojson, results.json, summary.png, map.png, index.html を生成
    # index.html をブラウザで開く（地図タイルとLeafletの読み込みにネット接続が必要）

## ファイル
- sim.py: OSMの解析、歩行グラフの作成、エージェント、シナリオ、指標の集計、出力まで全部入り
- template.html: Leafletビューアのひな形（sim.py がデータを埋め込んで index.html を作る）
- asagaya_osm.geojson: 道路とPOI（© OpenStreetMap contributors, ODbL）
- results.json: シナリオごとの指標（30シードの平均）

## モデル
- ペルソナ: 会社員6、子育て世帯4、学生4、高齢者4、在宅ワーカー2。自宅は道路ノードからランダムに選ぶ
- 1日の予定はペルソナごとの確率ルールで決める。行き先は「魅力度 × exp(-距離/200m)」の重みで選ぶ（雨の日は距離の分母を120mにする）
- 移動は道路グラフ上の最短経路。歩く速さは80m/分（雨の日は65m/分）。1分刻みで06:00〜24:00を動かす
- シナリオ: baseline / newcafe（駅前に魅力度3倍の仮想カフェ）/ event（13〜16時に駅前イベント）/ rain（公園の利用を0.15倍、買い物とカフェを0.7倍、滞在を0.8倍）
