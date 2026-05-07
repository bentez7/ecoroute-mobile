import ExpoModulesCore
import MapboxCoreNavigation
import MapboxNavigation
import MapboxDirections
import MapboxMaps

class ExpoMapboxNavigationView: ExpoView {
    private let onRouteProgressChanged   = EventDispatcher()
    private let onCancelNavigation       = EventDispatcher()
    private let onWaypointArrival        = EventDispatcher()
    private let onFinalDestinationArrival = EventDispatcher()
    private let onRouteChanged           = EventDispatcher()
    private let onUserOffRoute           = EventDispatcher()
    private let onRoutesLoaded           = EventDispatcher()
    private let onRouteFailedToLoad      = EventDispatcher()

    let controller = ExpoMapboxNavigationViewController()

    required init(appContext: AppContext? = nil) {
        super.init(appContext: appContext)
        clipsToBounds = true
        addSubview(controller.view)

        controller.onRouteProgressChanged    = onRouteProgressChanged
        controller.onCancelNavigation        = onCancelNavigation
        controller.onWaypointArrival         = onWaypointArrival
        controller.onFinalDestinationArrival = onFinalDestinationArrival
        controller.onRouteChanged            = onRouteChanged
        controller.onUserOffRoute            = onUserOffRoute
        controller.onRoutesLoaded            = onRoutesLoaded
        controller.onRouteFailedToLoad       = onRouteFailedToLoad
    }

    override func layoutSubviews() {
        controller.view.frame = bounds
    }
}

class ExpoMapboxNavigationViewController: UIViewController {
    var navigationViewController: NavigationViewController? = nil

    var currentCoordinates: [CLLocationCoordinate2D]? = nil
    var currentWaypointIndices: [Int]? = nil
    var isUsingRouteMatchingApi: Bool = false
    var muted: Bool = false
    var currentDirectionsJsonString: String? = nil

    var onRouteProgressChanged:    EventDispatcher? = nil
    var onCancelNavigation:        EventDispatcher? = nil
    var onWaypointArrival:         EventDispatcher? = nil
    var onFinalDestinationArrival: EventDispatcher? = nil
    var onRouteChanged:            EventDispatcher? = nil
    var onUserOffRoute:            EventDispatcher? = nil
    var onRoutesLoaded:            EventDispatcher? = nil
    var onRouteFailedToLoad:       EventDispatcher? = nil

    private var calculateTask: URLSessionDataTask? = nil
    private var progressObserver:  NSObjectProtocol? = nil
    private var rerouteObserver:   NSObjectProtocol? = nil
    private var willRerouteObserver: NSObjectProtocol? = nil

    init() {
        super.init(nibName: nil, bundle: nil)
        installNotificationObservers()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        fatalError("Storyboard init not supported")
    }

    deinit {
        calculateTask?.cancel()
        if let o = progressObserver    { NotificationCenter.default.removeObserver(o) }
        if let o = rerouteObserver     { NotificationCenter.default.removeObserver(o) }
        if let o = willRerouteObserver { NotificationCenter.default.removeObserver(o) }
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        navigationViewController?.navigationService.stop()
    }

    private func installNotificationObservers() {
        let nc = NotificationCenter.default
        progressObserver = nc.addObserver(
            forName: .routeControllerProgressDidChange, object: nil, queue: .main
        ) { [weak self] note in
            guard let self = self else { return }
            guard let progress = note.userInfo?[RouteController.NotificationUserInfoKey.routeProgressKey] as? RouteProgress else { return }
            self.onRouteProgressChanged?([
                "distanceRemaining":  progress.distanceRemaining,
                "distanceTraveled":   progress.distanceTraveled,
                "durationRemaining":  progress.durationRemaining,
                "fractionTraveled":   progress.fractionTraveled,
            ])
        }
        willRerouteObserver = nc.addObserver(
            forName: .routeControllerWillReroute, object: nil, queue: .main
        ) { [weak self] _ in
            self?.onUserOffRoute?()
        }
        rerouteObserver = nc.addObserver(
            forName: .routeControllerDidReroute, object: nil, queue: .main
        ) { [weak self] _ in
            self?.onRouteChanged?()
        }
    }

    // MARK: - Setters called from JS props

    func setCoordinates(coordinates: [CLLocationCoordinate2D]) {
        currentCoordinates = coordinates
        update()
    }

    func setWaypointIndices(waypointIndices: [Int]?) {
        currentWaypointIndices = waypointIndices
        update()
    }

    func setIsUsingRouteMatchingApi(useRouteMatchingApi: Bool?) {
        isUsingRouteMatchingApi = useRouteMatchingApi ?? false
        update()
    }

    func setDirectionsJson(jsonString: String?) {
        currentDirectionsJsonString = (jsonString?.isEmpty == true) ? nil : jsonString
        update()
    }

    func setIsMuted(isMuted: Bool?) {
        muted = isMuted ?? false
        navigationViewController?.voiceController?.speechSynthesizer.muted = muted
    }

    func recenterMap() {
        navigationViewController?.navigationMapView?.navigationCamera.follow()
    }

    // No-op stubs kept for JS compatibility — v2 spike doesn't surface these props.
    func setVehicleMaxHeight(maxHeight: Double?) {}
    func setVehicleMaxWidth(maxWidth: Double?) {}
    func setLocale(locale: String?) {}
    func setRouteProfile(profile: String?) {}
    func setRouteExcludeList(excludeList: [String]?) {}
    func setMapStyle(style: String?) {}
    func setCustomRasterSourceUrl(url: String?) {}
    func setPlaceCustomRasterLayerAbove(layerId: String?) {}
    func setDisableAlternativeRoutes(disableAlternativeRoutes: Bool?) {}
    func setFollowingZoom(followingZoom: Double?) {}
    func setInitialLocation(location: CLLocationCoordinate2D, zoom: Double?) {}

    // MARK: - Routing

    private func update() {
        guard let coords = currentCoordinates, coords.count >= 2 else { return }
        calculateTask?.cancel()
        calculateTask = nil

        let waypoints = coords.enumerated().map { (i, c) -> Waypoint in
            var w = Waypoint(coordinate: c)
            w.separatesLegs = currentWaypointIndices == nil ? true : currentWaypointIndices!.contains(i)
            return w
        }

        // Route-injection path: caller supplied a full Mapbox-Directions-shape
        // JSON (produced by the backend). Decode it directly into a
        // RouteResponse so we skip re-running Map Matching on the client.
        if let jsonString = currentDirectionsJsonString {
            presentFromDirectionsJson(jsonString: jsonString, waypoints: waypoints)
            return
        }

        if isUsingRouteMatchingApi {
            calculateMatching(waypoints: waypoints)
        } else {
            calculateRouting(waypoints: waypoints)
        }
    }

    // Remove any previously-presented NavigationViewController so we don't end
    // up with two live nav sessions stacked in the view hierarchy. Without
    // this, an in-flight Directions/MapMatching response that lands after a
    // JSON-injection update will overlay a second, re-snapped route on top of
    // the verbatim one.
    private func tearDownNavigationViewController() {
        guard let nv = navigationViewController else { return }
        nv.navigationService.stop()
        nv.willMove(toParent: nil)
        nv.view.removeFromSuperview()
        nv.removeFromParent()
        navigationViewController = nil
    }

    private func presentFromDirectionsJson(jsonString: String, waypoints: [Waypoint]) {
        guard let data = jsonString.data(using: .utf8) else {
            onRouteFailedToLoad?(["errorMessage": "directions JSON is not valid UTF-8"])
            return
        }
        guard let first = waypoints.first, let last = waypoints.last, waypoints.count >= 2 else {
            onRouteFailedToLoad?(["errorMessage": "need at least 2 waypoints for route injection"])
            return
        }

        // RouteResponse decoder cross-references its decoded waypoints array
        // against options.waypoints — counts must match or downstream
        // legSeparators bookkeeping assigns nil endpoints into legs and crashes.
        // Our injected JSON only has origin + destination, so build the options
        // with the same two waypoints (both leg-separating).
        var origin = Waypoint(coordinate: first.coordinate)
        origin.separatesLegs = true
        var dest = Waypoint(coordinate: last.coordinate)
        dest.separatesLegs = true
        let routeOptions = NavigationRouteOptions(waypoints: [origin, dest])
        // Synth JSON encodes geometry at polyline precision 5 (the
        // @mapbox/polyline default). NavigationRouteOptions defaults to
        // .polyline6, which would decode every coord 10x too small and put
        // the route in the Atlantic Ocean — triggering an immediate reroute.
        routeOptions.shapeFormat = .polyline

        let decoder = JSONDecoder()
        decoder.userInfo[.options]     = routeOptions
        decoder.userInfo[.credentials] = Directions.shared.credentials

        do {
            let response = try decoder.decode(RouteResponse.self, from: data)
            NSLog("[ExpoMapboxNavigation] presentFromDirectionsJson: decoded routes=\(response.routes?.count ?? 0)")
            present(response: response)
        } catch {
            NSLog("[ExpoMapboxNavigation] presentFromDirectionsJson: decode failed \(error)")
            onRouteFailedToLoad?(["errorMessage": "Failed to decode directions JSON: \(error.localizedDescription)"])
        }
    }

    private func calculateRouting(waypoints: [Waypoint]) {
        let options = NavigationRouteOptions(waypoints: waypoints)
        calculateTask = Directions.shared.calculate(options) { [weak self] (_, result) in
            guard let self = self else { return }
            switch result {
                case .failure(let error):
                    self.onRouteFailedToLoad?(["errorMessage": error.localizedDescription])
                case .success(let response):
                    self.present(response: response)
            }
        }
    }

    private func calculateMatching(waypoints: [Waypoint]) {
        let options = NavigationMatchOptions(waypoints: waypoints)
        calculateTask = Directions.shared.calculateRoutes(matching: options) { [weak self] (_, result) in
            guard let self = self else { return }
            switch result {
                case .failure(let error):
                    self.onRouteFailedToLoad?(["errorMessage": error.localizedDescription])
                case .success(let response):
                    self.present(response: response)
            }
        }
    }

    private func present(response: RouteResponse) {
        let routeCount = response.routes?.count ?? 0
        let optsKind: String = {
            switch response.options {
            case .route:  return "route"
            case .match:  return "match"
            }
        }()
        NSLog("[ExpoMapboxNavigation] present: routes=\(routeCount) optionsKind=\(optsKind)")

        guard let routes = response.routes, !routes.isEmpty else {
            NSLog("[ExpoMapboxNavigation] present: empty routes — aborting")
            onRouteFailedToLoad?(["errorMessage": "No routes returned from Mapbox"])
            return
        }

        let firstRoute = routes[0]
        NSLog("[ExpoMapboxNavigation] present: route0 distance=\(firstRoute.distance) legs=\(firstRoute.legs.count)")
        if let shape = firstRoute.shape {
            let coords = shape.coordinates
            let firstC = coords.first.map { "(\($0.latitude),\($0.longitude))" } ?? "nil"
            let lastC  = coords.last.map  { "(\($0.latitude),\($0.longitude))" } ?? "nil"
            NSLog("[ExpoMapboxNavigation] present: shape coords=\(coords.count) first=\(firstC) last=\(lastC)")
        } else {
            NSLog("[ExpoMapboxNavigation] present: shape is nil")
        }

        let indexed = IndexedRouteResponse(routeResponse: response, routeIndex: 0)
        NSLog("[ExpoMapboxNavigation] present: built IndexedRouteResponse")

        onRoutesLoaded?([
            "routes": [
                "mainRoute": convertRoute(route: firstRoute),
                "alternativeRoutes": [],
            ]
        ])

        tearDownNavigationViewController()

        let nv = NavigationViewController(for: indexed, navigationOptions: nil)
        NSLog("[ExpoMapboxNavigation] present: built NavigationViewController")
        nv.delegate = self
        NSLog("[ExpoMapboxNavigation] present: delegate set")
        nv.voiceController?.speechSynthesizer.muted = muted
        NSLog("[ExpoMapboxNavigation] present: voice set")
        navigationViewController = nv

        addChild(nv)
        NSLog("[ExpoMapboxNavigation] present: addChild done")
        view.addSubview(nv.view)
        NSLog("[ExpoMapboxNavigation] present: addSubview done")
        nv.view.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            nv.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            nv.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            nv.view.topAnchor.constraint(equalTo: view.topAnchor),
            nv.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        NSLog("[ExpoMapboxNavigation] present: constraints activated")
        nv.didMove(toParent: self)
        NSLog("[ExpoMapboxNavigation] present: didMove done")
    }

    private func convertRoute(route: Route) -> Any {
        return [
            "distance":           route.distance,
            "expectedTravelTime": route.expectedTravelTime,
            "legs": route.legs.map { leg -> [String: Any] in
                return [
                    "steps": leg.steps.map { step -> [String: Any] in
                        var stepDict: [String: Any] = [:]
                        if let shape = step.shape {
                            stepDict["shape"] = [
                                "coordinates": shape.coordinates.map { c -> [String: Any] in
                                    return ["latitude": c.latitude, "longitude": c.longitude]
                                }
                            ]
                        }
                        return stepDict
                    }
                ]
            }
        ]
    }
}

extension ExpoMapboxNavigationViewController: NavigationViewControllerDelegate {
    func navigationViewControllerDidDismiss(
        _ navigationViewController: NavigationViewController,
        byCanceling canceled: Bool
    ) {
        if canceled { onCancelNavigation?() }
    }

    func navigationViewController(
        _ navigationViewController: NavigationViewController,
        didArriveAt waypoint: Waypoint
    ) -> Bool {
        let isFinal = navigationViewController.navigationService.routeProgress.isFinalLeg
        if isFinal {
            onFinalDestinationArrival?()
        } else {
            onWaypointArrival?()
        }
        return true
    }
}
