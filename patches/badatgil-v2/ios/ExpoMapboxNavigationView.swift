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

    func setIsMuted(isMuted: Bool?) {
        muted = isMuted ?? false
        navigationViewController?.voiceController.speechSynthesizer.muted = muted
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

        let waypoints = coords.enumerated().map { (i, c) -> Waypoint in
            var w = Waypoint(coordinate: c)
            w.separatesLegs = currentWaypointIndices == nil ? true : currentWaypointIndices!.contains(i)
            return w
        }

        if isUsingRouteMatchingApi {
            calculateMatching(waypoints: waypoints)
        } else {
            calculateRouting(waypoints: waypoints)
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

        let indexed = IndexedRouteResponse(routeResponse: response, routeIndex: 0)
        NSLog("[ExpoMapboxNavigation] present: built IndexedRouteResponse")

        onRoutesLoaded?([
            "routes": [
                "mainRoute": convertRoute(route: firstRoute),
                "alternativeRoutes": [],
            ]
        ])

        let nv = NavigationViewController(for: indexed, navigationOptions: nil)
        NSLog("[ExpoMapboxNavigation] present: built NavigationViewController")
        nv.delegate = self
        nv.voiceController.speechSynthesizer.muted = muted
        navigationViewController = nv

        addChild(nv)
        view.addSubview(nv.view)
        nv.view.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            nv.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            nv.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            nv.view.topAnchor.constraint(equalTo: view.topAnchor),
            nv.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        nv.didMove(toParent: self)
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
