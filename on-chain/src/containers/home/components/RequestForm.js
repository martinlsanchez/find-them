import React, {Component} from 'react';
import PropTypes from 'prop-types';
import { drizzleConnect } from 'drizzle-react';

import axios from 'axios';
import { ToastContainer, toast } from 'react-toastify';
import {Link, withRouter} from 'react-router-dom';
import {GoogleMap, Marker} from 'react-google-maps';
import {
    Grid, Row, Col, Modal, FormGroup,
    ControlLabel, FormControl, Form, HelpBlock
} from 'react-bootstrap';
import Datepicker from 'react-16-bootstrap-date-picker';

import {BasicGoogleMap} from "../../../components/map/Map";
import Button from "../../../components/button/Button";
import urls from "../../../utils/urls";
import loading from "../../../assets/loading.gif";

class RequestForm extends Component{

    constructor(props, context){
        super(props);

        this.state = {
            ajaxInProgress: false,
            show: false,
            showMetamaskModal:false,

            first_name: '',
            last_name: '',
            identifier: '',
            photo: '',
            email: '',
            description: '',
            age: '',
            lastSeenDate: new Date().toISOString(),
            lastSeenLocation: {
                lat: '',
                lng: ''
            },
            incentive: '',

            myLatLng: false
        };

    }

    componentDidMount() {
        this._getLocation();
    }

    _getLocation = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((position) => {
                this.setState({
                        myLatLng: {
                            lat: position.coords.latitude,
                            lng: position.coords.longitude
                        }
                    }
                );
            })
        }
    };

    _handleDateChange = (value) => {
        this.setState({
            lastSeenDate: value
        });
    };

    _handleInput = (prop, value) => {

        // Setting up a max for age
        if(prop === 'age' && value > 99) value = 99;
        if(prop === 'incentive' && value < 0) value = 0;

        this.setState({[prop]: value});
    };

    _handleClose = () => {
        this.setState({show: false});
    };

    _notify = (text, type) => {
        toast(text, {
            position: "top-right",
            autoClose: false,
            hideProgressBar: false,
            closeOnClick: true,
            pauseOnHover: true,
            draggable: true,
            type
        });
    };

     dismissAll = () =>  toast.dismiss();

    _submitForm = async (ev) => {
        ev.preventDefault();


        let {
            first_name, last_name, identifier, photo, email, description, age,
            lastSeenLocation, lastSeenDate, incentive
        } = this.state;

        if(!incentive || incentive === 0){
            let message = 'Please input an incentive to continue';
            this._notify(message, toast.TYPE.ERROR);
            return false;
        }

        this.setState({ajaxInProgress: true});
        this.dismissAll();

        let {drizzle} = this.context;
        let state = drizzle.store.getState();
        let {drizzleStatus} = this.props;
        const accounts = await drizzle.web3.eth.getAccounts();

        let location = `${lastSeenLocation.lat},${lastSeenLocation.lng}`;
        let lastDate = `${lastSeenDate}`;

        if (drizzleStatus.initialized) {

            let message = <p className={'text-center'}>
                <img src={loading} className={'loading-icon'} />
                Your request has been submitted. Please be patient while we share it accross the network.
            </p>;
            this._notify(message, toast.TYPE.INFO);
            return false;

            const stackId = await drizzle.contracts.FindRequestFactory.methods.createFindRequest(
                    age,
                    location,
                    lastDate,
                    description
                ).send({
                    from: accounts[0],
                    value: drizzle.web3.utils.toWei(incentive.toString(), "ether")
                });

            if(stackId.status){
                try{
                    drizzle.contracts.FindRequestFactory.methods.getSummary().call()
                        .then(contractSummary => {
                            let contractsAmount = parseInt(contractSummary[2], 10);
                            let newContract = stackId.events.newFindRequestCreated.returnValues.newAddress;

                            const formData = new FormData();
                            formData.append('photo', photo);
                            formData.set('first_name', first_name);
                            formData.set('last_name', last_name);
                            formData.set('identifier', identifier);
                            formData.set('creator_email', email);
                            formData.set('lost_date', lastDate);
                            formData.set('location', location);
                            formData.set('description', description);
                            formData.set('creator_address', accounts[0]);
                            formData.set('contract_deployed_address', newContract);
                            formData.set('finished', false);
                            formData.set('index', contractsAmount - 1);
                            this._postToOffChain(formData);
                        });
                }
                catch(e){
                    console.log(e);
                }
            }

            //Use the dataKey to display the transaction status.
            if (state.transactionStack[stackId]) {
                const txHash = state.transactionStack[stackId];
                console.log('TxHash: ', state.transactions[txHash].status);
            }

        }

    };

    _postToOffChain = (form) => {
        const URL = `${urls.API_ROOT}/api/v1/requests/`;
        axios.post(URL, form, {'Content-Type': 'multipart/form-data'})
            .then(response => {
                this.props.history.push(`/detail/${response.data.contract_deployed_address}/`);
            })
            .catch(e => {
                console.log(e);
            });
    };

    _mapRender = (props) => {
        let _self = this;

        let {myLatLng, lastSeenLocation} = props;

        if(!myLatLng) myLatLng = {lat: 52.5067614, lng: 13.284651};

        let marker = '';
        if(lastSeenLocation && lastSeenLocation.lat && lastSeenLocation.lng){
            marker = (
                <Marker position={lastSeenLocation} />
            );
        }

        return (
            <GoogleMap
                defaultZoom={10}
                defaultCenter={myLatLng}
                onClick={(ev) => {
                    let lat = ev.latLng.lat();
                    let lng = ev.latLng.lng();
                    _self.setState({
                        lastSeenLocation: {lat, lng}
                    });
                }}
            >
                {marker}
            </GoogleMap>
        );
    };

    checkMetamask = () => {
        if(!this.props.drizzleStatus.initialized){
            this.setState({showMetamaskModal: true});
        }else{
            this.setState({show: true})
        }
    };

   closeMetamaskModal = () =>{
       this.setState({showMetamaskModal: false});
   };

    render(){
        let {first_name, last_name, identifier, email, description, age,
            incentive, lastSeenDate, lastSeenLocation,
            myLatLng, ajaxInProgress
        } = this.state;
        let buttonsDisabled = ajaxInProgress;

        return (
            <Grid className={'request-form'}>
                <Row>
                    <Col xs={12} className={'text-right'}>
                        <div className={'button-container'}>
                            <Button onClick={() => {this.checkMetamask()}}>
                                Create new request
                            </Button>
                        </div>
                    </Col>
                </Row>
                <Modal show={this.state.show} onHide={this._handleClose} className={'request-form-modal'}>
                    <Modal.Header closeButton>
                        <Modal.Title>New Finding Request</Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                        <p>
                            Please complete the form below to create the request to the network
                        </p>
                        <div>
                            <Form
                                onSubmit={this._submitForm}
                            >
                                <Row>
                                    <Col xs={12} sm={6}>
                                        <FormGroup>
                                            <ControlLabel>First Name</ControlLabel>
                                            <FormControl
                                                type="text"
                                                value={first_name}
                                                placeholder="Enter the first name"
                                                onChange={ev => this._handleInput('first_name', ev.target.value)}
                                            />
                                        </FormGroup>
                                    </Col>
                                    <Col xs={12} sm={6}>
                                        <FormGroup>
                                            <ControlLabel>Last Name</ControlLabel>
                                            <FormControl
                                                type="text"
                                                value={last_name}
                                                placeholder="Enter the last name"
                                                onChange={ev => this._handleInput('last_name', ev.target.value)}
                                            />
                                        </FormGroup>
                                    </Col>
                                </Row>
                                <Row>
                                    <Col xs={12} sm={6}>
                                        <FormGroup>
                                            <ControlLabel>Legal ID</ControlLabel>
                                            <FormControl
                                                type="text"
                                                value={identifier}
                                                placeholder="Enter the legal document identifier"
                                                onChange={ev => this._handleInput('identifier', ev.target.value)}
                                            />
                                        </FormGroup>
                                    </Col>
                                    <Col xs={12} sm={6}>
                                        <FormGroup>
                                            <ControlLabel>Age</ControlLabel>
                                            <FormControl
                                                type="number"
                                                value={age}
                                                placeholder="Enter the age"
                                                onChange={ev => this._handleInput('age', ev.target.value)}
                                            />
                                        </FormGroup>
                                    </Col>
                                </Row>
                                <Row>
                                    <Col xs={12}>
                                        <FormGroup>
                                            <ControlLabel>Description</ControlLabel>
                                            <FormControl
                                                componentClass="textarea"
                                                value={description}
                                                placeholder="Enter a description of the person that is missing"
                                                onChange={ev => this._handleInput('description', ev.target.value)}
                                            />
                                        </FormGroup>
                                    </Col>
                                </Row>
                                <Row>
                                    <Col xs={12} sm={6}>
                                        <FormGroup>
                                            <ControlLabel>Picture</ControlLabel>
                                            <FormControl
                                                type="file"
                                                onChange={(ev) => this.setState({photo: ev.target.files[0]})}
                                                accept={"image/*"}
                                            />
                                            <HelpBlock>Please upload a photo as updated as possible</HelpBlock>
                                        </FormGroup>
                                    </Col>
                                    <Col xs={12} sm={6}>
                                        <FormGroup>
                                            <ControlLabel>Last Seen Date</ControlLabel>
                                            <Datepicker  id="last-seen-datepicker" value={lastSeenDate} onChange={this._handleDateChange}/>
                                        </FormGroup>
                                    </Col>
                                </Row>
                                <Row>
                                    <Col xs={12}>
                                        <FormGroup>
                                            <ControlLabel>Last known location</ControlLabel>
                                            <HelpBlock>Please click on the map on the last known location</HelpBlock>
                                        </FormGroup>
                                        <BasicGoogleMap
                                            renderMethod={this._mapRender}
                                            myLatLng={myLatLng}
                                            lastSeenLocation={lastSeenLocation}
                                        />
                                    </Col>
                                </Row>
                                <Row>
                                    <Col xs={12} sm={6}>
                                        <FormGroup>
                                            <ControlLabel>Contact Email</ControlLabel>
                                            <FormControl
                                                type="email"
                                                value={email}
                                                placeholder="Enter a contact email"
                                                onChange={ev => this._handleInput('email', ev.target.value)}
                                            />
                                        </FormGroup>
                                    </Col>
                                    <Col xs={12} sm={6}>
                                        <FormGroup>
                                            <ControlLabel>Incentive</ControlLabel>
                                            <FormControl
                                                type="number"
                                                value={incentive}
                                                placeholder="Enter an incentive in ETH"
                                                onChange={ev => this._handleInput('incentive', ev.target.value)}
                                            />
                                        </FormGroup>
                                    </Col>
                                </Row>
                            </Form>
                        </div>
                    </Modal.Body>
                    <Modal.Footer>
                        <Row className={"modal-buttons"}>
                            <Col xs={12}>
                                <Button className={`blue ${buttonsDisabled ? 'disabled' : ''}`}
                                        onClick={this._handleClose} disabled={buttonsDisabled}>
                                    Cancel
                                </Button>
                                <Button className={`blue-full ${buttonsDisabled ? 'disabled' : ''}`}
                                        onClick={this._submitForm} disabled={buttonsDisabled}>
                                    Submit
                                </Button>
                            </Col>
                        </Row>
                    </Modal.Footer>
                </Modal>
                <Modal show={this.state.showMetamaskModal} onHide={this.closeMetamaskModal} className={'vertical-center'}>
                    <Modal.Header closeButton>
                        <Modal.Title id={"modalTitle"}>
                            <img style={{marginBottom:20}} src={require('../../../assets/find-them-blue-aqua.png')}
                                 alt={"Get Metamask"}/>
                        </Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                        <Grid className={"row margin-top-20 margin-bottom-20 text-center"}>
                            <Row>
                                <Col xs={6}>
                                    <p><b> You’ll need an account to make a request</b></p>
                                </Col>
                            </Row>
                            <Row>
                                <Col xs={6}>
                                    <p >{`We recommend you MetaMask. This will also act as your login for you to monitor your deployed rules.
                                    Do you already have Metamask installed?Make sure that your account is not blocked.`}</p>
                                </Col>
                            </Row>
                            <Row className={"modal-buttons"}>
                                <Col xs={6}>
                                    <Link to={"//metamask.io"} target={"_blank"}>
                                        <Button onClick={this.handleClose} color="secondary" variant="contained">
                                            Get Metamask
                                        </Button>
                                    </Link>
                                </Col>
                            </Row>
                        </Grid>
                        {/*{this.state.ajaxInProgress ? <Spinner/> : <div><br/><br/></div>}*/}
                    </Modal.Body>
                </Modal>
                <ToastContainer
                    position="top-right"
                    autoClose={false}
                    newestOnTop={false}
                    closeOnClick
                    rtl={false}
                    pauseOnVisibilityChange
                />
            </Grid>
        );
    }

}

RequestForm.contextTypes = {
    drizzle: PropTypes.object
};

const mapStateToProps = state => {
    return {
        web3: state.web3,
        drizzleStatus: state.drizzleStatus,
        FindRequestFactory: state.contracts.FindRequestFactory
    }
};

const RequestFormContainer = withRouter(drizzleConnect(RequestForm, mapStateToProps));
export default RequestFormContainer;