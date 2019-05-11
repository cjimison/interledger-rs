use base64;
use bytes::Bytes;
use futures::{future::ok, Future};
use hyper::{
    header::{HeaderValue, ACCEPT},
    service::{service_fn, Service},
    Body, Error, Method, Request, Response, Server,
};
use interledger_btp::{connect_client, create_open_signup_server, parse_btp_url};
use interledger_http::{HttpClientService, HttpServerService};
use interledger_ildcp::{get_ildcp_info, IldcpAccount, IldcpResponse, IldcpService};
use interledger_packet::{ErrorCode, RejectBuilder};
use interledger_router::Router;
use interledger_service::{incoming_service_fn, outgoing_service_fn, OutgoingRequest};
use interledger_service_util::ValidatorService;
use interledger_spsp::{pay, SpspResponder};
use interledger_store_memory::{Account, AccountBuilder, InMemoryStore};
use interledger_stream::StreamReceiverService;
use parking_lot::RwLock;
use ring::rand::{SecureRandom, SystemRandom};
use std::{net::SocketAddr, str, sync::Arc, u64};
use url::Url;

#[doc(hidden)]
pub fn random_token() -> String {
    let mut bytes: [u8; 18] = [0; 18];
    SystemRandom::new().fill(&mut bytes).unwrap();
    base64::encode_config(&bytes, base64::URL_SAFE_NO_PAD)
}

#[doc(hidden)]
pub fn random_secret() -> [u8; 32] {
    let mut bytes: [u8; 32] = [0; 32];
    SystemRandom::new().fill(&mut bytes).unwrap();
    bytes
}

#[doc(hidden)]
pub fn send_spsp_payment_btp(
    btp_server: &str,
    receiver: &str,
    amount: u64,
    quiet: bool,
) -> impl Future<Item = (), Error = ()> {
    let receiver = receiver.to_string();
    let btp_server = parse_btp_url(btp_server).unwrap();
    let account = AccountBuilder::new()
        .additional_routes(&[&b""[..]])
        .btp_outgoing_token(btp_server.password().unwrap_or_default().to_string())
        .btp_uri(btp_server)
        .build();
    connect_client(
        vec![account.clone()],
        true,
        outgoing_service_fn(|request: OutgoingRequest<Account>| {
            Err(RejectBuilder {
                code: ErrorCode::F02_UNREACHABLE,
                message: &format!(
                    "No route found for address: {}",
                    str::from_utf8(&request.from.client_address()[..]).unwrap_or("<not utf8>")
                )
                .as_bytes(),
                triggered_by: &[],
                data: &[],
            }
            .build())
        }),
    )
    .map_err(|err| {
        eprintln!("Error connecting to BTP server: {:?}", err);
        eprintln!("(Hint: is moneyd running?)");
    })
    .and_then(move |btp_service| {
        let service = btp_service.handle_incoming(incoming_service_fn(|_| {
            Err(RejectBuilder {
                code: ErrorCode::F02_UNREACHABLE,
                message: b"Not expecting incoming prepare packets",
                triggered_by: &[],
                data: &[],
            }
            .build())
        }));
        // TODO seems kind of janky to clone the btp_service just to
        // close it later. Is there some better way of making sure it closes?
        let btp_service = service.clone();
        let service = ValidatorService::outgoing(service);
        let store = InMemoryStore::from_accounts(vec![account.clone()]);
        let router = Router::new(store, service);
        pay(router, account, &receiver, amount)
            .map_err(|err| {
                eprintln!("Error sending SPSP payment: {:?}", err);
            })
            .and_then(move |delivered| {
                if !quiet {
                    println!(
                        "Sent: {}, delivered: {} (in the receiver's units)",
                        amount, delivered
                    );
                }
                btp_service.close();
                Ok(())
            })
    })
}

#[doc(hidden)]
pub fn send_spsp_payment_http(
    http_server: &str,
    receiver: &str,
    amount: u64,
    quiet: bool,
) -> impl Future<Item = (), Error = ()> {
    let receiver = receiver.to_string();
    let url = Url::parse(http_server).expect("Cannot parse HTTP URL");
    let account = if let Some(token) = url.password() {
        AccountBuilder::new()
            .additional_routes(&[&b""[..]])
            .http_endpoint(Url::parse(http_server).unwrap())
            .http_outgoing_token(token.to_string())
            .build()
    } else {
        AccountBuilder::new()
            .additional_routes(&[&b""[..]])
            .http_endpoint(Url::parse(http_server).unwrap())
            .build()
    };
    let store = InMemoryStore::from_accounts(vec![account.clone()]);
    let service = HttpClientService::new(
        store.clone(),
        outgoing_service_fn(|request: OutgoingRequest<Account>| {
            Err(RejectBuilder {
                code: ErrorCode::F02_UNREACHABLE,
                message: &format!(
                    "No outgoing route for: {}",
                    str::from_utf8(&request.from.client_address()[..]).unwrap_or("<not utf8>")
                )
                .as_bytes(),
                triggered_by: &[],
                data: &[],
            }
            .build())
        }),
    );
    let service = ValidatorService::outgoing(service);
    let service = Router::new(store, service);
    pay(service, account, &receiver, amount)
        .map_err(|err| {
            eprintln!("Error sending SPSP payment: {:?}", err);
        })
        .and_then(move |delivered| {
            if !quiet {
                println!(
                    "Sent: {}, delivered: {} (in the receiver's units)",
                    amount, delivered
                );
            }
            Ok(())
        })
}

// TODO allow server secret to be specified
#[doc(hidden)]
pub fn run_spsp_server_btp(
    btp_server: &str,
    address: SocketAddr,
    quiet: bool,
) -> impl Future<Item = (), Error = ()> {
    debug!("Starting SPSP server");
    let ilp_address = Arc::new(RwLock::new(Bytes::new()));
    let btp_server = parse_btp_url(btp_server).unwrap();
    let incoming_account: Account = AccountBuilder::new()
        .additional_routes(&[b"peer."])
        .btp_outgoing_token(btp_server.password().unwrap_or_default().to_string())
        .btp_uri(btp_server)
        .build();
    let server_secret = Bytes::from(&random_secret()[..]);
    let store = InMemoryStore::from_accounts(vec![incoming_account.clone()]);

    let ilp_address_clone = ilp_address.clone();
    connect_client(
        vec![incoming_account.clone()],
        true,
        outgoing_service_fn(move |request: OutgoingRequest<Account>| {
            Err(RejectBuilder {
                code: ErrorCode::F02_UNREACHABLE,
                message: &format!(
                    "No outgoing route for: {}",
                    str::from_utf8(&request.from.client_address()[..]).unwrap_or("<not utf8>")
                )
                .as_bytes(),
                triggered_by: &ilp_address_clone.read()[..],
                data: &[],
            }
            .build())
        }),
    )
    .map_err(|err| {
        eprintln!("Error connecting to BTP server: {:?}", err);
        eprintln!("(Hint: is moneyd running?)");
    })
    .and_then(move |btp_service| {
        let outgoing_service = ValidatorService::outgoing(btp_service.clone());
        let outgoing_service = StreamReceiverService::new(server_secret.clone(), outgoing_service);
        let incoming_service = Router::new(store.clone(), outgoing_service);
        let mut incoming_service = ValidatorService::incoming(incoming_service);

        btp_service.handle_incoming(incoming_service.clone());

        get_ildcp_info(&mut incoming_service, incoming_account.clone()).and_then(move |info| {
            debug!("SPSP server got ILDCP info: {:?}", info);
            let client_address = Bytes::from(info.client_address());
            *ilp_address.write() = client_address.clone();

            let receiver_account = AccountBuilder::new()
                .ilp_address(&client_address[..])
                .asset_code(String::from_utf8(info.asset_code().to_vec()).unwrap_or_default())
                .asset_scale(info.asset_scale())
                // Send all outgoing packets to this account
                .additional_routes(&[&b""[..]])
                .build();
            store.add_account(receiver_account);

            if !quiet {
                println!("Listening on: {}", address);
            }
            debug!(
                "SPSP server listening on {} with ILP address {}",
                &address,
                str::from_utf8(&client_address).unwrap_or("<not utf8>")
            );
            let spsp_responder = SpspResponder::new(client_address, server_secret);
            Server::bind(&address)
                .serve(move || spsp_responder.clone())
                .map_err(|e| eprintln!("Server error: {:?}", e))
        })
    })
}

#[doc(hidden)]
pub fn run_spsp_server_http(
    ildcp_info: IldcpResponse,
    address: SocketAddr,
    auth_token: String,
    quiet: bool,
) -> impl Future<Item = (), Error = ()> {
    if !quiet {
        println!(
            "Creating SPSP server. ILP Address: {}",
            str::from_utf8(ildcp_info.client_address()).expect("ILP address is not valid UTF8")
        )
    }
    let account: Account = AccountBuilder::new()
        .http_incoming_token(auth_token)
        .build();
    let server_secret = Bytes::from(&random_secret()[..]);
    let store = InMemoryStore::from_accounts(vec![account.clone()]);
    let spsp_responder = SpspResponder::new(
        Bytes::from(ildcp_info.client_address()),
        server_secret.clone(),
    );
    let ilp_address = Bytes::from(ildcp_info.client_address());
    let outgoing_handler = StreamReceiverService::new(
        server_secret,
        outgoing_service_fn(move |request: OutgoingRequest<Account>| {
            Err(RejectBuilder {
                code: ErrorCode::F02_UNREACHABLE,
                message: &format!(
                    "No handler configured for destination: {}",
                    str::from_utf8(&request.prepare.destination()).unwrap_or("<not utf8>")
                )
                .as_bytes(),
                triggered_by: &ilp_address[..],
                data: &[],
            }
            .build())
        }),
    );
    let incoming_handler = Router::new(store.clone(), outgoing_handler);
    let incoming_handler = IldcpService::new(incoming_handler);
    let incoming_handler = ValidatorService::incoming(incoming_handler);
    let http_service = HttpServerService::new(incoming_handler, store);

    if !quiet {
        println!("Listening on: {}", address);
    }
    Server::bind(&address)
        .serve(move || {
            let mut spsp_responder = spsp_responder.clone();
            let mut http_service = http_service.clone();
            service_fn(
                move |req: Request<Body>| -> Box<Future<Item = Response<Body>, Error = Error> + Send> {
                    match (req.method(), req.uri().path(), req.headers().get(ACCEPT)) {
                        (&Method::GET, "/spsp", _) => Box::new(spsp_responder.call(req)),
                        (&Method::GET, "/.well-known/pay", _) => Box::new(spsp_responder.call(req)),
                        (&Method::POST, "/ilp", _) => Box::new(http_service.call(req)),
                        (&Method::GET, _, Some(accept_header)) => {
                            if accept_header == HeaderValue::from_static("application/spsp4+json") {
                                Box::new(spsp_responder.call(req))
                            } else {
                        Box::new(ok(Response::builder()
                            .status(404)
                            .body(Body::empty())
                            .unwrap()))
                            }
                        },
                        _ => Box::new(ok(Response::builder()
                            .status(404)
                            .body(Body::empty())
                            .unwrap())),
                    }
                },
            )
        })
        .map_err(|err| eprintln!("Server error: {:?}", err))
}

#[doc(hidden)]
pub fn run_moneyd_local(
    address: SocketAddr,
    ildcp_info: IldcpResponse,
) -> impl Future<Item = (), Error = ()> {
    let ilp_address = Bytes::from(ildcp_info.client_address());
    let store = InMemoryStore::default();
    // TODO this needs a reference to the BtpService so it can send outgoing packets
    println!("Listening on: {}", address);
    let ilp_address_clone = ilp_address.clone();
    let rejecter = outgoing_service_fn(move |_| {
        Err(RejectBuilder {
            code: ErrorCode::F02_UNREACHABLE,
            message: b"No open connection for account",
            triggered_by: &ilp_address_clone[..],
            data: &[],
        }
        .build())
    });
    create_open_signup_server(address, ildcp_info, store.clone(), rejecter).and_then(
        move |btp_service| {
            let service = Router::new(store, btp_service.clone());
            let service = IldcpService::new(service);
            let service = ValidatorService::incoming(service);
            btp_service.handle_incoming(service);
            Ok(())
        },
    )
}
