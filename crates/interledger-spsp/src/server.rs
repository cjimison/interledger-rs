use super::SpspResponse;
use bytes::Bytes;
use futures::future::{ok, FutureResult, IntoFuture};
use hyper::{service::Service as HttpService, Body, Error, Request, Response};
use interledger_stream::ConnectionGenerator;
use std::error::Error as StdError;
use std::{fmt, str};

fn extract_original_url(request: &Request<Body>) -> String {
    let headers = request.headers();
    let host = headers
        .get("forwarded")
        .and_then(|header| {
            let header = header.to_str().ok()?;
            if let Some(index) = header.find(" for=") {
                let host_start = index + 5;
                (&header[host_start..]).split_whitespace().next()
            } else {
                None
            }
        })
        .or_else(|| {
            headers
                .get("x-forwarded-host")
                .and_then(|header| header.to_str().ok())
        })
        .or_else(|| headers.get("host").and_then(|header| header.to_str().ok()))
        .unwrap_or("");

    let mut url = host.to_string();
    url.push_str(request.uri().path());
    url.push_str(request.uri().query().unwrap_or(""));
    url
}

/// A Hyper::Service that responds to incoming SPSP Query requests with newly generated
/// details for a STREAM connection.
#[derive(Clone)]
pub struct SpspResponder {
    connection_generator: ConnectionGenerator,
}

impl SpspResponder {
    pub fn new(ilp_address: Bytes, server_secret: Bytes) -> Self {
        let connection_generator = ConnectionGenerator::new(ilp_address, server_secret);
        SpspResponder {
            connection_generator,
        }
    }

    pub fn generate_http_response_from_tag(&self, tag: &str) -> Response<Body> {
        let (destination_account, shared_secret) = self
            .connection_generator
            .generate_address_and_secret(tag.as_bytes());
        let destination_account = String::from_utf8(destination_account.to_vec()).unwrap();
        debug!("Generated address and secret for: {}", destination_account);
        let response = SpspResponse {
            destination_account,
            shared_secret: shared_secret.to_vec(),
        };

        Response::builder()
            .header("Content-Type", "application/spsp4+json")
            .header("Cache-Control", "max-age=60")
            .status(200)
            .body(Body::from(serde_json::to_string(&response).unwrap()))
            .unwrap()
    }
}

impl HttpService for SpspResponder {
    type ReqBody = Body;
    type ResBody = Body;
    type Error = Error;
    type Future = FutureResult<Response<Body>, Error>;

    fn call(&mut self, request: Request<Self::ReqBody>) -> Self::Future {
        let original_url = extract_original_url(&request);
        ok(self.generate_http_response_from_tag(&original_url))
    }
}

impl IntoFuture for SpspResponder {
    type Item = Self;
    type Error = Never;
    type Future = FutureResult<Self::Item, Self::Error>;

    fn into_future(self) -> Self::Future {
        ok(self)
    }
}

// copied from https://github.com/hyperium/hyper/blob/master/src/common/never.rs
#[derive(Debug)]
pub enum Never {}

impl fmt::Display for Never {
    fn fmt(&self, _: &mut fmt::Formatter) -> fmt::Result {
        match *self {}
    }
}

impl StdError for Never {
    fn description(&self) -> &str {
        match *self {}
    }
}

#[cfg(test)]
mod spsp_server_test {
    use super::*;
    use futures::Future;

    #[test]
    fn spsp_response_headers() {
        let mut responder =
            SpspResponder::new(Bytes::from("example.receiver"), Bytes::from(&[0; 32][..]));
        let response = responder
            .call(
                Request::builder()
                    .method("GET")
                    .uri("http://example.com")
                    .header("Accept", "application/spsp4+json")
                    .body(Body::empty())
                    .unwrap(),
            )
            .wait()
            .unwrap();
        assert_eq!(
            response.headers().get("Content-Type").unwrap(),
            "application/spsp4+json"
        );
        assert_eq!(
            response.headers().get("Cache-Control").unwrap(),
            "max-age=60"
        );
    }
}
