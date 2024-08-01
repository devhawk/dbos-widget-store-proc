import { StoredProcedure, StoredProcedureContext } from '@dbos-inc/dbos-sdk';

export enum OrderStatus {
  PENDING = 0,
  FULFILLED = 1,
  CANCELLED = -1,
}

export interface Product {
  product_id: number,
  product: string,
  description: string,
  inventory: number,
  price: number,
}

export interface Order {
  order_id: number,
  order_status: number,
  last_update_time: Date,
  product_id: number,
}

export class ShopUtilities {
  @StoredProcedure()
  static async subtractInventory(ctxt: StoredProcedureContext, productId: number): Promise<void> {
    const query = 'update "products" set "inventory" = inventory - $1 where "product_id" = $2 and "inventory" >= $3';
    const result = await ctxt.query<Product>(query, [1, productId, 1]);

    //A good block to uncomment in time-travel debugger to see an example of querying past state
    // const ttquery =  'select "inventory" from "products" where "product_id" = $1';
    // const products = await ctxt.client.query<Product>(ttquery, [productId])
    // ctxt.logger.info(">>> Remaining inventory: " + products.rows[0].inventory); 

    if (result.rowCount <= 0) {
      throw new Error("Insufficient Inventory");
    }
  }

  @StoredProcedure()
  static async undoSubtractInventory(ctxt: StoredProcedureContext, productId: number): Promise<void> {
    const query = 'update "products" set "inventory" = inventory + $1 where "product_id" = $2';
    await ctxt.query(query, [1, productId])
  }

  @StoredProcedure({ readOnly: true })
  static async retrieveProduct(ctxt: StoredProcedureContext, productId: number): Promise<Product> {
    const query = 'select product_id, product, description, inventory, price from "products" where "product_id" = $1';
    const results = await ctxt.query<Product>(query, [productId])
    if (results.rows.length === 0) {
      throw new Error(`Product ${productId} not found`);
    }

    const row = results.rows[0];
    // explicitly convert price to number to address behavior difference between NodePG and PLV8
    row.price = +row.price;
    ctxt.logger.info(`Product ${productId} found: ${JSON.stringify(row)}`);
    return row;
  }

  @StoredProcedure()
  static async createOrder(ctxt: StoredProcedureContext, productId: number): Promise<number> {
    const query = 'insert into "orders" ("last_update_time", "order_status", "product_id") values (CURRENT_TIMESTAMP, $1, $2) returning "order_id"';
    const results = await ctxt.query<Order>(query, [OrderStatus.PENDING, productId,])
    const orderID = results.rows[0].order_id;
    return orderID;
  }

  @StoredProcedure()
  static async fulfillOrder(ctxt: StoredProcedureContext, orderId: number): Promise<void> {
    const query = 'update "orders" set "order_status" = $1, "last_update_time" = CURRENT_TIMESTAMP where "order_id" = $2';
    await ctxt.query(query, [OrderStatus.FULFILLED, orderId])
  }

  @StoredProcedure()
  static async errorOrder(ctxt: StoredProcedureContext, orderId: number): Promise<void> {
    const query = 'update "orders" set "order_status" = $1, "last_update_time" = CURRENT_TIMESTAMP where "order_id" = $2';
    await ctxt.query(query, [OrderStatus.CANCELLED, orderId])
  }

  @StoredProcedure({ readOnly: true})
  static async retrieveOrder(ctxt: StoredProcedureContext, orderId: number): Promise<Order> {
    const query = 'select * from "orders" where "order_id" = $1';
    const results = await ctxt.query<Order>(query, [orderId])
    if (results.rows.length === 0) {
      throw new Error(`Order ${orderId} not found`);
    }
    const row = results.rows[0];
    ctxt.logger.info(`Order ${orderId} found: ${JSON.stringify(row)}`);
    return row;
  }
}
