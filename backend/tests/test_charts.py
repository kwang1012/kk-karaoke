from services import charts


def test_title_matches_subtitle_and_script():
    assert charts._title_matches("甲乙丙丁Strangers - 你我怎麼兩清", "甲乙丙丁Strangers")
    assert charts._title_matches("海嶼你", "海屿你")
    assert not charts._title_matches("海嶼你", "完全不同的歌")


def test_artist_matches_aliases_and_unknown():
    assert charts._artist_matches("李佳薇 (Jess Lee)", ["Jess Lee"])
    assert charts._artist_matches("A2O, A2O LITE", ["A2O"])
    assert charts._artist_matches("Various Artists", ["Anyone"])
    assert not charts._artist_matches("Adele", ["Taylor Swift"])


def test_other_cuts_are_not_the_chart_song():
    assert charts._is_version("Song", "Song (Live)")
    assert charts._is_version("Song", "Song (合唱版)")
    assert not charts._is_version("Song (Live)", "Song (Live)")


def test_listing_ids_open_as_charts():
    ids = [chart["id"] for group in charts.listing() for chart in group["charts"]]
    assert "chart:kkbox:297" in ids and "chart:ytmusic:tw:trending" in ids
    assert all(charts._title_for(i) for i in ids)
