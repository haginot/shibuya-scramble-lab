"""Attribution resources shared by installed and checkout exports."""
from importlib import resources
from pathlib import Path


def write_notices(directory, data_directory):
    for target in (Path(directory), Path(data_directory)):
        target.mkdir(parents=True, exist_ok=True)
        for name in ('LICENSE', 'NOTICE'):
            text = resources.files('asagaya_town_sim').joinpath('licenses', name).read_text(encoding='utf-8')
            (target / name).write_text(text, encoding='utf-8')
    refresh_data_index(data_directory)


def refresh_data_index(directory):
    from html import escape
    directory = Path(directory)
    links = ''.join(f'<li><a href="{escape(p.name, quote=True)}">{escape(p.name)}</a></li>'
                    for p in sorted(directory.iterdir()) if p.is_file() and p.name != 'index.html')
    (directory / 'index.html').write_text(
        '<!doctype html><meta charset="utf-8"><title>Data and attribution</title>'
        '<h1>加工済みデータ / Derived data</h1>'
        '<p><a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a> · '
        '<a href="https://opendatacommons.org/licenses/odbl/1-0/">ODbL 1.0</a>. '
        '道路・POI・建物 / roads, POIs and buildings.</p>'
        '<p>Shibuya buildings: 国土交通省 Project PLATEAU・渋谷区 2023, '
        '<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>. '
        'CityGMLを足元形状＋高さに加工。shibuya_plateau.jsonはCC BY。混合アダプター buildings_shibuya.json の buildings はCC BY 4.0、rails はOSM由来ODbL 1.0。 / buildings: CC BY; rails: ODbL.</p>'
        '<p>阿佐ケ谷・高円寺のみ：国土地理院の標高タイルを加工して作成（DEM5A／DEM10B）。</p>'
        f'<ul>{links}</ul>', encoding='utf-8')
