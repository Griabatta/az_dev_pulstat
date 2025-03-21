import { Injectable, Logger, Req, Res } from '@nestjs/common';
import { fetchCl } from './fetch';
import axios, { AxiosResponse } from 'axios';
import { stockDTO, analystDTO, transactionDTO, productListDTO, headerDTO } from 'src/entities/dto/fetch-ozon.dto';
import { Request, Response } from 'express';
import { CreateAnalyticsDto, CreateProductDto, CreateStockDto, CreateTransactionDto } from 'src/entities/dto/create-seller.dto';
import { PrismaService } from './prisma.service';
import { Prisma } from '@prisma/client';
import { Console } from 'console';

@Injectable()
export class OzonSellerService {

  
  constructor(
    private readonly prisma: PrismaService
  ) {}
  //_________________________________ANALYTICS_________________________________
  //-----------RESPONSE--------------
  async getAnalyst(
    headers: headerDTO,
    @Req() req: Request,
    @Res() res: Response
  ): Promise<CreateAnalyticsDto[]> {

    if (!headers['Client-Id'] || !headers['Api-Key']) {
      await this.prisma.journalErrors.create({
        data: {
          errorUserId: Number(headers['Client-Id']),
          errorMassage: `Unauthorized. No Client-Id or Api-key.`,
          errorPriority: 3,
          errorCode: '401',
          errorServiceName: 'Seller/Analytics'
        }
      })
      res.status(401).send({ message: "Unauthorized" });
    };

    const url = 'https://api-seller.ozon.ru/v1/analytics/data';
    const {datefrom, dateto, dimension, filters, sort, limit, offset, metrics} = req.body;
    const dateNow = new Date();
    const date_from = req.body.date_from ||  new Date(dateNow.setMonth(dateNow.getMonth() - 1)).toISOString().slice(0, 10); // За последний месяц
    const date_to = req.body.date_to || dateNow.toISOString().slice(0, 10);
    const defaultMetrics = ['revenue ', 'ordered_units'];
    const defaultDimensions = ['sku', 'day'];

    const metricTemplate = {
      "revenue": 0,
      "ordered_units": 0,
      "unknown_metric": 0,
      "hits_view_pdp": 0,
      "hits_view": 0,
      "hits_tocart_search": 0,
      "hits_tocart_pdp": 0,
      "hits_tocart": 0,
      "session_view_search": 0,
      "session_view_pdp": 0,
      "session_view": 0,
      "conv_tocart_search": 0,
      "conv_tocart_pdp": 0,
      "conv_tocart": 0,
      "returns": 0,
      "cancellations": 0,
      "delivered_units": 0,
      "position_category": 0,
    };
    
    const body: analystDTO = {
      "date_from": datefrom || date_from,
      "date_to": dateto || date_to,
      "dimension": dimension || defaultDimensions,
      "filters": filters || [],
      "sort": sort || [{}],
      "limit": limit || 1000,
      "offset": offset || 0,
      "metrics": metrics || defaultMetrics
    };

    try {
      Logger.log("-------------------------------")
      Logger.log("Request data..")
      const response = await axios.post(url, body, { headers });
      Logger.log("Data received.");
      Logger.log("Start data conversion..")
      const formatingData = response.data.result.data;
      
      const result: CreateAnalyticsDto[] = formatingData.map(dates => {
        const metrics = body.metrics.reduce((acc, name, index) => {
          acc[name] = dates.metrics[index];
          return acc;
        }, {} as Record<string, number>);
        return {
          "dimensions": JSON.stringify(dates.dimensions), 
          ...metricTemplate,          
          ...metrics                   
        };
      })
      Logger.log("Data converted.")
      Logger.log("-------------------------------")
      return result;
    } catch (error) {
      await this.prisma.journalErrors.create({
        data: {
          errorUserId: Number(headers['Client-Id']),
          errorMassage: `Request aborted, error: ${error.message}`,
          errorPriority: 3,
          errorCode: error.status,
          errorServiceName: 'Seller/Analytics/Data'
        }
      })
      return error.message;
    }
  }
  // ----------------IMPORT-------------------
  async importAnalytics(userId: number, analyticsData: CreateAnalyticsDto[]) {

    if (analyticsData.length === 0) {
      await this.prisma.journalErrors.create({
        data: {
          errorUserId: userId,
          errorMassage: "No data",
          errorPriority: 2,
          errorCode: '404',
          errorServiceName: 'Seller/Analytics/Data'
        }
      });
      throw new Error('No data');
    };
    Logger.log("Start import..")
    const data = analyticsData.map(item => ({
      ...item,
      userId
    }));

    try {
      await this.prisma.analytics.createMany(
        {
          data: data
        }
      );
      Logger.log("Import success");
      Logger.log("-------------------------------")
    } catch (error) {
      if (error.status === 500) {
        await this.prisma.journalErrors.create({
          data: {
            errorUserId: userId,
            errorMassage: error.message,
            errorPriority: 3,
            errorCode: '500',
            errorServiceName: 'Seller/Analytics/Data'
          }
        })
      }
      
      throw new Error(`Failed to import analytics data: ${error}`);
    }
  }
  // ----------------RESPONSE&&IMPORT-------------
  async fetchAndImportAnalytics(userId: number, headers: headerDTO, @Req() req: Request, @Res() res: Response) {
    const analyticsData:CreateAnalyticsDto[] = await this.getAnalyst(headers, req, res);
    await this.importAnalytics(userId, analyticsData);
  }

  //_________________________________STOCK_________________________________
  //------RESPONSE-------
  async getStock(
    headers: headerDTO,
    @Req() req: Request,
    @Res() res: Response
  ): Promise<CreateStockDto[]> {

    const url = 'https://api-seller.ozon.ru/v2/analytics/stock_on_warehouses';

    if (!headers['Client-Id'] || !headers['Api-Key']) {
      await this.prisma.journalErrors.create({
        data: {
          errorUserId: Number(headers['Client-Id']),
          errorMassage: `Unauthorized. No Client-Id or Api-key.`,
          errorPriority: 3,
          errorCode: '401',
          errorServiceName: 'Seller/Stock/WareHouse'
        }
      })
      res.status(401).send({ message: "Unauthorized" });
    };

    const body: stockDTO = {
      "limit": req.body.limit || 1000,
      "offset": req.body.offset || 0,
      "warehouse_type": req.body.warehouse_type || "ALL"
    }


    try {
      Logger.log("-------------------------------")
      Logger.log("Request data..")
      const response = await axios.post(url, body, { headers });
      Logger.log("Data received.");
      Logger.log("Start data conversion..")
      const result = response.data?.result.rows;
      Logger.log("Data converted");
      Logger.log("-------------------------------")
      return result;
    } catch (error) {
      await this.prisma.journalErrors.create({
        data: {
          errorUserId: Number(headers['Client-Id']),
          errorMassage: `Request aborted, error: ${error.message}`,
          errorPriority: 3,
          errorCode: error.status,
          errorServiceName: 'Seller/Stock/WareHouse'
        }
      })
      return error.message;
    }
  }

  //------IMPORT-------
  async importStock(userId: number, stockData: CreateStockDto[]) {
    
    if (stockData.length === 0) {
      await this.prisma.journalErrors.create({
        data: {
          errorUserId: userId,
          errorMassage: "No data",
          errorPriority: 2,
          errorCode: '404',
          errorServiceName: 'Seller/Stock/WareHouse'
        }
      });
      throw new Error('No data');
    };
    Logger.log("Start import..")
    const data = stockData.map(item => ({
      ...item,
      userId
    }));

    try {
      await this.prisma.stock_Warehouse.createMany(
        {
          data: data
        }
      );
      Logger.log("Import success");
      Logger.log("-------------------------------")
    } catch (error) {

      if (error.status === 500) {
        await this.prisma.journalErrors.create({
          data: {
            errorUserId: userId,
            errorMassage: error.message,
            errorPriority: 3,
            errorCode: '500',
            errorServiceName: 'Seller/Stock/WareHouse'
          }
        })
      }

      throw new Error(`Failed to import analytics data: ${error}`);
    }
  }

  // ----------RESPONSE&&IMPORT---------
  async fetchAndImportStock(userId: number, headers: headerDTO, @Req() req: Request, @Res() res: Response) {
    const stockData = await this.getStock(headers, req, res);
    await this.importStock(userId, stockData);
  }


  //_________________________________TRANSACTION_________________________________
  //--------RESPONSE--------
  async getTransactions(
    headers: headerDTO,
    @Req() req: Request,
    @Res() res: Response
  ): Promise<CreateTransactionDto[]> {
    const url = 'https://api-seller.ozon.ru/v3/finance/transaction/list';
    const {datefrom, dateto, operation_type, posting_number, transaction_type, page, page_size} = req.body;

    if (!headers['Client-Id'] || !headers['Api-Key']) {
      await this.prisma.journalErrors.create({
        data: {
          errorUserId: Number(headers['Client-Id']),
          errorMassage: `Unauthorized. No Client-Id or Api-key.`,
          errorPriority: 3,
          errorCode: '401',
          errorServiceName: 'Seller/Transaction'
        }
      })
      res.status(401).send({ message: "Unauthorized" });
    };

    const dateNow = new Date();
    const date_from = req.body.filter.date.from ||  new Date(dateNow.setMonth(dateNow.getMonth() - 1)).toISOString(); // За последний месяц
    const date_to = req.body.filter.date.to || dateNow.toISOString();

    const body: transactionDTO = {
      "filter": {
        "date": {
          "from": datefrom || date_from,
          "to": dateto || date_to
        },
        "operation_type": operation_type || [],
        "posting_number": posting_number || "",
        "transaction_type": transaction_type || "all"
      },
      "page": page || 1,
      "page_size": page_size || 1000
    }
    
    try {
      Logger.log("-------------------------------")
      Logger.log("Request data..");
      const response = await axios.post(url, body, { headers });
      Logger.log("Data received.");
      Logger.log("Start data conversion..");

      const page = response.data.result.page_count;
      let data = response.data.result.operations;
      if (page > 1) {
        for (let i = 2; page >= i; i++) {
          const updatedBody = { ...body, page: i };
          const nextPageResponse = await axios.post(url, updatedBody, { headers });
          data = [...data, ...nextPageResponse.data.result.operations];
        }
      };

      

      let result:CreateTransactionDto[] = [];
      result.push(
        ...data.map((item:any) => {
          item.delivery_schema = item.posting.delivery_schema || "";
          item.order_date = item.posting.order_date  || "";
          item.posting_number = item.posting.posting_number  || "";
          item.warehouse_id = item.posting.warehouse_id || 0;
          delete item.posting
          item.items = JSON.stringify(item.items) || Prisma.JsonNull;
          item.services = JSON.stringify(item.services) || Prisma.JsonNull;
          return item
        })
      )
      Logger.log("Data converted.")
      Logger.log("-------------------------------")
      return result;
    } catch (error) {
      await this.prisma.journalErrors.create({
        data: {
          errorUserId: Number(headers['Client-Id']),
          errorMassage: `Request aborted, error: ${error.message}`,
          errorPriority: 3,
          errorCode: error.status,
          errorServiceName: 'Seller/Transaction'
        }
      })
      return error.message;
    }
  }
  //------IMPORT-------
  async importTransaction(userId: number, transactionData: CreateTransactionDto[]) {

    if (transactionData.length === 0) {
      await this.prisma.journalErrors.create({
        data: {
          errorUserId: userId,
          errorMassage: "No data",
          errorPriority: 2,
          errorCode: '404',
          errorServiceName: 'Seller/Transaction'
        }
      });
      throw new Error('No data');
    };

    const data = transactionData.map(item => ({
      ...item,
      userId
    }));

    Logger.log("Start import..");

    try {
      await this.prisma.transaction_List.createMany(
        {
          data: data
        }
      );
      Logger.log("Import Success");
      Logger.log("-------------------------------")
    } catch (error) {

      if (error.status === 500) {
        await this.prisma.journalErrors.create({
          data: {
            errorUserId: userId,
            errorMassage: error.message,
            errorPriority: 3,
            errorCode: '500',
            errorServiceName: 'Seller/Transaction'
          }
        })
      }
      throw new Error(`Failed to import analytics data: ${error.message}`);
    }
  }

  // ----------RESPONSE&&IMPORT---------
  async fetchAndImportTransaction(userId: number, headers: headerDTO, @Req() req: Request, @Res() res: Response) {
    Logger.log("Start Transaction..")
    const transactionData = await this.getTransactions(headers, req, res);
    await this.importTransaction(userId, transactionData);
    Logger.log("\nTransaction end.")
  }





  //_________________________________PRODUCT_________________________________
  //-------RESPONSE-------
  async getProduct(
    headers: headerDTO,
    @Req() req: Request,
    @Res() res: Response
  ): Promise<CreateProductDto[]> {
    if (!headers['Client-Id'] || !headers['Api-Key']) {
      await this.prisma.journalErrors.create({
        data: {
          errorUserId: Number(headers['Client-Id']),
          errorMassage: `Unauthorized. No Client-Id or Api-key.`,
          errorPriority: 3,
          errorCode: '401',
          errorServiceName: 'Seller/ProductList'
        }
      })
      res.status(401).send({ message: "Unauthorized" });
    };
    const url = 'https://api-seller.ozon.ru/v3/product/list';
    const {offer_id, product_id, visibility, last_id, limit} = req.body;

    const body: productListDTO = {
      "filter": {
        "offer_id": offer_id || [],
        "product_id": product_id || [],
        "visibility": visibility || "ALL"
      },
      "last_id": last_id || "",
      "limit": limit || 100
    };
    
    try {
      Logger.log("-------------------------------")
      Logger.log("Request data..");
      const response = await axios.post(url, body, { headers });
      Logger.log("Data received.");
      Logger.log("Start data conversion..");
      const last_id = response.data.result.last_id;
      let data = response.data.result.items;
      
      if (last_id !== "") {
        const updatedBody = { ...body, last_id: last_id};
        const nextPageResponse = await axios.post(url, updatedBody, { headers });
        data = [...data, ...nextPageResponse.data.result.items];
      }
      for (let item of data) {
        const quants = item.quants;
        item.quants = JSON.stringify(quants);
      }
      Logger.log("Data converted.")
      Logger.log("-------------------------------")
      return data;
    } catch (error) {
      await this.prisma.journalErrors.create({
        data: {
          errorUserId: Number(headers['Client-Id']),
          errorMassage: `Request aborted, error: ${error.message}`,
          errorPriority: 3,
          errorCode: error.status,
          errorServiceName: 'Seller/ProductList'
        }
      })
      return error.message;
    }
  }
  //------IMPORT-------
  async importProduct(userId: number, productData: CreateProductDto[]) {
      
    if (productData.length === 0) {
      await this.prisma.journalErrors.create({
        data: {
          errorUserId: userId,
          errorMassage: "No data",
          errorPriority: 2,
          errorCode: '404',
          errorServiceName: 'Seller/ProductList'
        }
      });
      throw new Error('No data');
    };

    const data = productData.map(item => ({
      ...item,
      userId
    }));

    Logger.log("Start import..");

    try {
      await this.prisma.product_List.createMany(
        {
          data: data
        }
      );
      Logger.log("Import Success");
      Logger.log("-------------------------------")
    } catch (error) {

      if (error.status === 500) {
        await this.prisma.journalErrors.create({
          data: {
            errorUserId: userId,
            errorMassage: error.message,
            errorPriority: 3,
            errorCode: '500',
            errorServiceName: 'Seller/ProductList'
          }
        })
      }
      throw new Error(`Failed to import analytics data: ${error.message}`);
    }
  }

  // ----------RESPONSE&&IMPORT---------
  async fetchAndImportProduct(userId: number, headers: headerDTO, @Req() req: Request, @Res() res: Response) {
    const productData = await this.getProduct(headers, req, res);
    await this.importProduct(userId, productData);
  }
  

}