# import yt_dlp
# import os
# import re
# import string
import syncedlyrics

# output_path = "raw_videos"
# if not os.path.exists(output_path):
#     os.makedirs(output_path)

# def _sanitize_filename(filename: str) -> str:
#     return filename
#     safe_chars = "-_.() %s%s" % (
#         re.escape(string.ascii_letters),
#         re.escape(string.digits),
#     )
#     safe_filename = re.sub(f"[^{safe_chars}]", "_", filename)
#     return safe_filename.strip()

# url = "https://www.youtube.com/watch?v=JdpNT5yRbwg&list=RDJdpNT5yRbwg&start_radio=1&ab_channel=leehomwangVEVO"
# with yt_dlp.YoutubeDL({"quiet": False, "noplaylist": True}) as ydl:
#     info_dict = ydl.extract_info(url, download=False)

# video_title = info_dict.get("title", None)
# video_title = _sanitize_filename(video_title)
# ydl_opts = {
#     "format": "bestaudio/best",
#     "postprocessors": [
#         {
#             "key": "FFmpegExtractAudio",
#             "preferredcodec": "mp3",
#             "preferredquality": "192",
#         }
#     ],
#     "outtmpl": os.path.join(output_path, video_title),
#     "noplaylist": True,
#     "quiet": True,
# }
# with yt_dlp.YoutubeDL(ydl_opts) as ydl:
#     ydl.download([url])
syncedlyrics.search("愛錯", synced_only=True, save_path="1234.lrc")