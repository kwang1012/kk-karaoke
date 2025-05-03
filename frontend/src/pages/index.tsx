import { useState } from "react";
import axios from "axios";

function IndexView() {
  const [file, setFile] = useState<any>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const handleUpload = async () => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await axios.post(
      "http://localhost:8000/upload",
      formData,
      {
        responseType: "blob",
      }
    );
    const url = window.URL.createObjectURL(new Blob([response.data]));
    setDownloadUrl(url);
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Karaoke App</h1>
      <input
        type="file"
        accept="audio/webm, audio/mp3"
        onChange={(e) => setFile(e.target.files?.[0])}
      />
      <button
        onClick={handleUpload}
        className="bg-blue-500 text-white px-4 py-2 rounded"
      >
        Upload & Process
      </button>
      {downloadUrl && <audio controls src={downloadUrl} className="mt-4" />}
      <br />
    </div>
  );
}

export default IndexView;
