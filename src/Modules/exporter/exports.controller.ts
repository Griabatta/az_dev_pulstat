import { Controller, Post, Body, Res, Logger } from '@nestjs/common';
import { Response } from 'express';
import { GoogleSheetsService } from 'src/Modules/exporter/exports.service';
import { JournalErrorsService } from '../Errors/errors.service';

@Controller('/api/export')
export class GoogleSheetsController {
  constructor(
    private readonly googleSheetsService: GoogleSheetsService,
    private readonly errors: JournalErrorsService
  ) {}

  @Post('/to-sheet')
    async exportData(@Body() body: { 
      sheetName: string; 
      data: any[][];
      hidden?: boolean;
    }) {
      // Создаем лист (если нужно) и экспортируем данные
      await this.googleSheetsService.ensureSheetExists(body.sheetName, body.hidden ?? false);
      return this.googleSheetsService.appendData(body.sheetName, body.data);
    }

  @Post('overwrite-sheet')
  async overwriteSheet(@Body() body: { dataType: string, userId: number}, @Res() res: Response) {
    try {
      const data = await this.googleSheetsService.getDataForExportByNameRequest(body.dataType, body.userId);

      if (data.length == 0) {
        await this.errors.logError({
          userId: body.userId,
          message: "Bad request. No data.",
          serviceName: body.dataType,
          code: "400",
          priority: 2
        })
        throw new Error("Bad request. No data.");
      }

      const validForm = await this.googleSheetsService.setValidFormForSheet(data);

      Logger.log("Data exported.");

      this.googleSheetsService.overwriteSheet(body.dataType, validForm);
      res.send({ message: "Successful export." });
      
    } catch (e) {
      Logger.log("Data not exported.");
      await this.errors.logError({
        userId: body.userId,
        message: "Failed to export data to table.",
        serviceName: body.dataType,
        code: "500",
        priority: 2
      })
      throw new Error("No export.");
    }
  }
//   @Post('from-sheet')
//   async importFromSheet(@Body() body: { range: string }) {
//     return this.googleSheetsService.getData(body.range);
//   }

  
}