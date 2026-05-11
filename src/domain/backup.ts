export type FileBackupEntry = {
  relativePath: string;
  existed: boolean;
  backupFileName: string | null;
};

export type BackupManifest = {
  version: 1;
  createdAt: string;
  reason: string;
  rootDir: string;
  backupDir: string;
  files: FileBackupEntry[];
};
