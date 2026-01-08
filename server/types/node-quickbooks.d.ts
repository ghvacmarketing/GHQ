declare module "node-quickbooks" {
  class QuickBooks {
    static AUTHORIZATION_URL: string;
    
    constructor(
      consumerKey: string,
      consumerSecret: string,
      token: string,
      tokenSecret: boolean,
      realmId: string,
      useSandbox: boolean,
      debug: boolean,
      minorVersion: number | null,
      oauthVersion: string,
      refreshToken: string
    );
    
    setMinorVersion(version: number): void;
    
    createCustomer(customer: any, callback: (err: any, result: any) => void): void;
    updateCustomer(customer: any, callback: (err: any, result: any) => void): void;
    getCustomer(id: string, callback: (err: any, result: any) => void): void;
    findCustomers(query: any, callback: (err: any, result: any) => void): void;
    
    createInvoice(invoice: any, callback: (err: any, result: any) => void): void;
    updateInvoice(invoice: any, callback: (err: any, result: any) => void): void;
    getInvoice(id: string, callback: (err: any, result: any) => void): void;
    findInvoices(query: any, callback: (err: any, result: any) => void): void;
    
    createPayment(payment: any, callback: (err: any, result: any) => void): void;
    getPayment(id: string, callback: (err: any, result: any) => void): void;
    findPayments(query: any, callback: (err: any, result: any) => void): void;
    
    getCompanyInfo(id: string, callback: (err: any, result: any) => void): void;
  }
  
  export = QuickBooks;
}
