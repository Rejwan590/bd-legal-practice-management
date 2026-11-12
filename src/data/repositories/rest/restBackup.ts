import { can } from '../../../permissions';
import { IBackupRepository } from '../../interfaces';
import {
  ChamberBackupData,
  ChamberBackupMetadata,
  ChamberBackupPayload,
  EncryptedBackupPayload,
  RestoreMode,
  RestorePreview,
  RestoreResult,
  SecurityContext,
} from '../../types';
import { inspectBackupFileContent, packageChamberBackup } from '../backup';
import { restFetch } from './restCommon';

export class RestBackupRepository implements IBackupRepository {
  async createBackup(
    context: SecurityContext,
    options?: {
      password?: string;
    }
  ): Promise<{
    filename: string;
    payload: ChamberBackupPayload | EncryptedBackupPayload;
    jsonString: string;
    metadata: ChamberBackupMetadata;
    checksum: string;
    isEncrypted: boolean;
  }> {
    if (!can('data.export', context.currentUser)) {
      throw new Error('Permission denied: data.export required to export chamber data');
    }

    const data = await restFetch<ChamberBackupData>('/backup/export');
    return packageChamberBackup(context, data, options);
  }

  async inspectBackup(
    context: SecurityContext,
    fileContent: string,
    password?: string
  ): Promise<RestorePreview> {
    return inspectBackupFileContent(context, fileContent, password);
  }

  async restoreBackup(
    context: SecurityContext,
    fileContent: string,
    options: {
      password?: string;
      mode: RestoreMode;
    }
  ): Promise<RestoreResult> {
    if (context.currentUser.role !== 'Owner') {
      throw new Error('Permission denied: Owner role required to restore backup');
    }

    const preview = await this.inspectBackup(context, fileContent, options.password);
    if (!preview.valid || !preview.payload) {
      throw new Error(
        preview.error ||
          (preview.warnings.length > 0
            ? preview.warnings[0]
            : 'Backup validation failed. Checksum mismatch or invalid payload.')
      );
    }

    return restFetch<RestoreResult>('/backup/restore', {
      method: 'POST',
      body: JSON.stringify({
        mode: options.mode,
        metadata: preview.payload.metadata,
        data: preview.payload.data,
      }),
    });
  }
}
