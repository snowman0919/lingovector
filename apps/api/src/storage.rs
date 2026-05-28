use std::path::PathBuf;

use tokio::fs;
use uuid::Uuid;

use crate::error::AppResult;

#[derive(Clone)]
pub struct LocalStorage {
    root: PathBuf,
}

impl LocalStorage {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    pub async fn save_bytes(
        &self,
        namespace: &str,
        filename: &str,
        bytes: &[u8],
    ) -> AppResult<String> {
        let id = Uuid::new_v4();
        let clean_name = sanitize_filename::sanitize(filename);
        let relative = format!("{}/{}-{}", namespace, id, clean_name);
        let path = self.root.join(&relative);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).await?;
        }
        fs::write(path, bytes).await?;
        Ok(relative)
    }

    pub async fn save_mock_wav(&self, namespace: &str, stem: &str) -> AppResult<String> {
        let wav = mock_wav();
        self.save_bytes(namespace, &format!("{stem}.wav"), &wav)
            .await
    }

    pub fn public_url(&self, relative: &str) -> String {
        format!("/media/{relative}")
    }

    pub fn full_path(&self, relative: &str) -> PathBuf {
        self.root.join(relative)
    }
}

fn mock_wav() -> Vec<u8> {
    let sample_rate = 8_000u32;
    let samples = sample_rate / 5;
    let data_size = samples * 2;
    let mut out = Vec::new();
    out.extend(b"RIFF");
    out.extend(&(36 + data_size).to_le_bytes());
    out.extend(b"WAVEfmt ");
    out.extend(&16u32.to_le_bytes());
    out.extend(&1u16.to_le_bytes());
    out.extend(&1u16.to_le_bytes());
    out.extend(&sample_rate.to_le_bytes());
    out.extend(&(sample_rate * 2).to_le_bytes());
    out.extend(&2u16.to_le_bytes());
    out.extend(&16u16.to_le_bytes());
    out.extend(b"data");
    out.extend(&data_size.to_le_bytes());
    for i in 0..samples {
        let phase = (i as f32 / sample_rate as f32) * 440.0 * std::f32::consts::TAU;
        let sample = (phase.sin() * 0.18 * i16::MAX as f32) as i16;
        out.extend(&sample.to_le_bytes());
    }
    out
}
